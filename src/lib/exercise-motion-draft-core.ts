/**
 * Exercise Media V2 — Motion Video Draft upload orchestration.
 *
 * This module contains the entire write-ordering / compensation state
 * machine as a pure function over an injected `MotionDraftDeps` interface,
 * so it is fully unit-testable (exercise-motion-draft-core.test.ts) without
 * a real Supabase connection. The only caller that supplies the real,
 * service-role-backed implementation is
 * exercise-motion-draft.functions.ts's server function handler - nothing
 * here imports Supabase, TanStack, or any admin-auth code, so it cannot
 * accidentally widen who can call it.
 *
 * FRAME RATE (read before changing verifiedFrameRate):
 * supabase/migrations/20260902084229_exercise_media_v2_followup.sql
 * relaxed `exercise_media_assets.frame_rate` to accept either NULL
 * ("not yet verified") or exactly 30 ("verified and correct") - it never
 * accepts any other value. Neither the browser nor this trusted Node
 * server can decode video to genuinely measure frame rate in this
 * environment, so `verifiedFrameRate` is always `null` on the real HTTP
 * path today (see exercise-motion-draft.functions.ts) - and that is now a
 * legitimate, successful outcome, not a blocker: the Draft is created with
 * an honestly-unverified frame rate rather than a fabricated one. A
 * non-null value that is not exactly 30 is still rejected up front as a
 * validation error, before any write - this module can hold "unverified"
 * or "verified and correct", never "verified and wrong". Tests inject an
 * explicit `30` to exercise that path, exactly the way a future privileged
 * probing service would.
 *
 * DEMONSTRATOR: VIORA-EXERCISE-GENERIC-DEMONSTRATOR-DECISION-001 - every
 * newly created Draft uses the single official V1 demonstrator
 * ("generic"), assigned server-side by reserve_exercise_media_draft().
 * There is no per-exercise resolution step here on purpose.
 *
 * CONCURRENCY (VIORA-EXERCISE-MOTION-DRAFT-UPLOAD-FINAL-REVIEW-001):
 * Draft creation/reuse and asset finalization are each a single atomic,
 * row-locked (or advisory-locked) database call - `reserveDraft` and
 * `finalizeAsset` - rather than separate read-then-write steps in this
 * module. This module never re-derives "does an asset already exist" or
 * "is the parent version still a Draft" from an earlier read of its own;
 * it always uses whatever the two RPCs return from inside their own
 * transactions, specifically so a concurrent request or a status change
 * that happens between two calls can never be missed. `storagePath` is
 * therefore always freshly token-suffixed (never a bare `motion.mp4`),
 * because whether this upload turns out to be a first-time write or a
 * replacement is only known *after* `finalizeAsset` runs - see its
 * `previousStoragePath` result, which is the only source this module ever
 * uses for "what to remove afterward".
 */
import {
  buildMotionVideoStoragePath,
  isUuid,
  MOTION_VIDEO_HEIGHT,
  MOTION_VIDEO_MAX_BYTES,
  MOTION_VIDEO_MAX_DURATION_MS,
  MOTION_VIDEO_MIME_TYPE,
  MOTION_VIDEO_MIN_DURATION_MS,
  MOTION_VIDEO_REQUIRED_FRAME_RATE,
  MOTION_VIDEO_WIDTH,
  type DemonstratorKey,
  type MotionDraftValidationError,
} from "./exercise-media-v2.ts";

export interface MotionVersionRow {
  id: string;
  versionNumber: number;
  demonstratorKey: DemonstratorKey;
}

export type ReserveDraftResult =
  | { outcome: "reserved"; version: MotionVersionRow; isNewDraft: boolean }
  | { outcome: "conflict"; currentStatus: string };

export type FinalizeAssetResult =
  | {
      outcome: "finalized";
      assetId: string;
      previousStoragePath: string | null;
      wasReplacement: boolean;
    }
  | { outcome: "needs_confirmation"; existingAssetId: string; previousStoragePath: string }
  | { outcome: "version_not_found" }
  | { outcome: "version_not_draft"; blockedStatus: string };

export interface MotionDraftDeps {
  /** The exercise must exist; returns false otherwise. Never trusts a client-supplied boolean. */
  exerciseExists(exerciseId: string): Promise<boolean>;
  /**
   * Atomically reuses the exercise's active Draft, reports a conflict for
   * any other working status, or creates a brand-new Draft with the
   * single official demonstrator - all inside one locked transaction (see
   * reserve_exercise_media_draft in the follow-up migration), so two
   * concurrent callers for the same exercise can never create two Draft
   * rows or collide unpredictably.
   */
  reserveDraft(input: { exerciseId: string; actorUserId: string }): Promise<ReserveDraftResult>;
  /** Compensation only: removes a version this same call just created and that has no audit history yet. */
  deleteVersion(versionId: string): Promise<void>;
  uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Compensation / replacement cleanup only. Must never be called with the current Published object's path. */
  removeObject(path: string): Promise<void>;
  /**
   * Atomically locks and re-checks the parent version's status and any
   * existing motion_video asset row, then upserts the asset and appends
   * its audit event(s) - all inside one transaction (see
   * finalize_exercise_motion_video_asset in the follow-up migration).
   * Returns an outcome rather than throwing for expected control flow, so
   * this module never has to parse error text to distinguish them.
   */
  finalizeAsset(input: {
    mediaVersionId: string;
    confirmReplace: boolean;
    storagePath: string;
    mimeType: string;
    fileSizeBytes: number;
    width: number;
    height: number;
    durationMs: number;
    frameRate: number | null;
    checksumSha256: string | null;
    actorUserId: string;
  }): Promise<FinalizeAssetResult>;
  sha256(bytes: Uint8Array): Promise<string>;
}

export interface MotionDraftUploadInput {
  exerciseId: string;
  actorUserId: string;
  fileBytes: Uint8Array;
  declaredMimeType: string;
  declaredWidth: number;
  declaredHeight: number;
  declaredDurationMs: number;
  /** Admin has already seen a `needs_confirmation` result and explicitly confirmed replacement. */
  confirmReplace: boolean;
  /**
   * A genuinely verified frame rate from a trusted source, or `null` when
   * honestly unverified (always `null` on the real HTTP path today - see
   * the module doc). A non-null value must be exactly
   * MOTION_VIDEO_REQUIRED_FRAME_RATE or the upload is rejected outright.
   */
  verifiedFrameRate: number | null;
}

export type MotionDraftUploadResult =
  | { status: "validation_error"; errors: MotionDraftValidationError[] }
  | { status: "not_found" }
  | { status: "conflict"; currentStatus: string }
  | {
      status: "needs_confirmation";
      existing: { assetId: string; storagePath: string };
    }
  | {
      status: "success";
      mediaVersionId: string;
      versionNumber: number;
      demonstratorKey: DemonstratorKey;
      wasNewDraft: boolean;
      wasReplacement: boolean;
      assetId: string;
      storagePath: string;
      frameRateVerified: boolean;
    }
  | {
      status: "failure";
      stage: "storage_upload" | "finalize";
      reason: string;
    };

function validateMetadata(input: MotionDraftUploadInput): MotionDraftValidationError[] {
  const errors: MotionDraftValidationError[] = [];
  const sizeBytes = input.fileBytes.byteLength;

  if (input.declaredMimeType !== MOTION_VIDEO_MIME_TYPE) {
    errors.push({ code: "invalid_mime_type", message: "invalid_mime_type" });
  }
  if (sizeBytes > MOTION_VIDEO_MAX_BYTES || sizeBytes <= 0) {
    errors.push({ code: "file_too_large", message: "file_too_large" });
  }
  if (input.declaredWidth !== MOTION_VIDEO_WIDTH || input.declaredHeight !== MOTION_VIDEO_HEIGHT) {
    errors.push({ code: "wrong_resolution", message: "wrong_resolution" });
  }
  if (
    input.declaredDurationMs < MOTION_VIDEO_MIN_DURATION_MS ||
    input.declaredDurationMs > MOTION_VIDEO_MAX_DURATION_MS
  ) {
    errors.push({ code: "duration_out_of_range", message: "duration_out_of_range" });
  }
  // A frame rate can be honestly unverified (null); it can never be
  // honestly wrong. Reject a non-null, non-30 value up front rather than
  // letting the database CHECK reject it after a Storage upload already
  // happened.
  if (
    input.verifiedFrameRate !== null &&
    input.verifiedFrameRate !== MOTION_VIDEO_REQUIRED_FRAME_RATE
  ) {
    errors.push({ code: "invalid_frame_rate", message: "invalid_frame_rate" });
  }
  return errors;
}

/**
 * The full Draft-creation-or-reuse, upload, and compensation pipeline for
 * one Motion Video. See the module doc for how concurrency and an
 * unverified frame rate are handled.
 */
export async function performMotionDraftUpload(
  deps: MotionDraftDeps,
  input: MotionDraftUploadInput,
): Promise<MotionDraftUploadResult> {
  if (!isUuid(input.exerciseId)) {
    return { status: "not_found" };
  }

  const metadataErrors = validateMetadata(input);
  if (metadataErrors.length > 0) {
    return { status: "validation_error", errors: metadataErrors };
  }

  if (!(await deps.exerciseExists(input.exerciseId))) {
    return { status: "not_found" };
  }

  const reservation = await deps.reserveDraft({
    exerciseId: input.exerciseId,
    actorUserId: input.actorUserId,
  });

  if (reservation.outcome === "conflict") {
    // media_ready / qa_passed / rejected / replacement_required (etc.):
    // never silently overwritten. Nothing was written; report the conflict.
    return { status: "conflict", currentStatus: reservation.currentStatus };
  }

  const { version, isNewDraft: wasNewDraft } = reservation;

  // Always a fresh, unique path - whether this upload turns out to be a
  // first-time write or a replacement is only known once finalizeAsset
  // runs (see the module doc), so there is no "plain" path to compute here.
  const storagePath = buildMotionVideoStoragePath(
    input.exerciseId,
    version.id,
    cryptoRandomToken(),
  );

  try {
    await deps.uploadObject(storagePath, input.fileBytes, input.declaredMimeType);
  } catch (err) {
    if (wasNewDraft) {
      await safeDeleteVersion(deps, version.id);
    }
    return {
      status: "failure",
      stage: "storage_upload",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  let checksumSha256: string | null = null;
  try {
    checksumSha256 = await deps.sha256(input.fileBytes);
  } catch {
    checksumSha256 = null; // optional per spec ("if safely calculated"); never blocks the upload.
  }

  let finalize: FinalizeAssetResult;
  try {
    finalize = await deps.finalizeAsset({
      mediaVersionId: version.id,
      confirmReplace: input.confirmReplace,
      storagePath,
      mimeType: input.declaredMimeType,
      fileSizeBytes: input.fileBytes.byteLength,
      width: input.declaredWidth,
      height: input.declaredHeight,
      durationMs: input.declaredDurationMs,
      frameRate: input.verifiedFrameRate,
      checksumSha256,
      actorUserId: input.actorUserId,
    });
  } catch (err) {
    // An actual transport/unexpected error (not one of finalizeAsset's
    // modeled outcomes) - the object we just uploaded is definitely not
    // referenced by any asset row, so remove it, plus a brand-new empty
    // Draft if this call created one.
    await safeRemoveObject(deps, storagePath);
    if (wasNewDraft) {
      await safeDeleteVersion(deps, version.id);
    }
    return {
      status: "failure",
      stage: "finalize",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (finalize.outcome === "version_not_found") {
    // Should not happen in practice (versions are never deleted except as
    // this module's own compensation for a version *this same call* just
    // created, which cannot race with itself) - handled defensively.
    await safeRemoveObject(deps, storagePath);
    return { status: "not_found" };
  }

  if (finalize.outcome === "version_not_draft") {
    // The version moved out of Draft between reservation and finalize
    // (e.g. a concurrent QA action) - discovered authoritatively inside
    // the locked transaction, not from a stale pre-upload read. The
    // object we just uploaded is orphaned; remove it.
    await safeRemoveObject(deps, storagePath);
    return { status: "conflict", currentStatus: finalize.blockedStatus };
  }

  if (finalize.outcome === "needs_confirmation") {
    // Also discovered authoritatively inside the same locked transaction.
    // The object we just uploaded is not referenced by any asset row;
    // remove it. The Admin must explicitly retry with confirmReplace.
    await safeRemoveObject(deps, storagePath);
    return {
      status: "needs_confirmation",
      existing: {
        assetId: finalize.existingAssetId,
        storagePath: finalize.previousStoragePath,
      },
    };
  }

  // outcome === "finalized"
  if (
    finalize.wasReplacement &&
    finalize.previousStoragePath &&
    finalize.previousStoragePath !== storagePath
  ) {
    // Remove only the exact previous path the transaction itself returned
    // - never a path assumed from an earlier read - and only now that the
    // Draft and its asset+events are all durably established.
    await safeRemoveObject(deps, finalize.previousStoragePath);
  }

  return {
    status: "success",
    mediaVersionId: version.id,
    versionNumber: version.versionNumber,
    demonstratorKey: version.demonstratorKey,
    wasNewDraft,
    wasReplacement: finalize.wasReplacement,
    assetId: finalize.assetId,
    storagePath,
    frameRateVerified: input.verifiedFrameRate !== null,
  };
}

async function safeDeleteVersion(deps: MotionDraftDeps, versionId: string): Promise<void> {
  try {
    await deps.deleteVersion(versionId);
  } catch {
    // Best-effort compensation; the version row has no asset and no audit
    // history, so a leftover empty Draft is a visible, harmless artifact
    // rather than a silent data-integrity problem.
  }
}

async function safeRemoveObject(deps: MotionDraftDeps, path: string): Promise<void> {
  try {
    await deps.removeObject(path);
  } catch {
    // Best-effort compensation; an orphaned object at a version-scoped,
    // never-publicly-listed path is a storage-cost concern, not a
    // data-integrity one, and never the current Published object (that
    // path is never passed to removeObject by this module).
  }
}

function cryptoRandomToken(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
