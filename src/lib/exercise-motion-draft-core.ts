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
 * (DEFAULT_DEMONSTRATOR_KEY, "generic"). There is no per-exercise
 * resolution step here on purpose.
 */
import {
  buildMotionVideoStoragePath,
  DEFAULT_DEMONSTRATOR_KEY,
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
  exerciseId: string;
  versionNumber: number;
  demonstratorKey: DemonstratorKey;
  status: string;
}

export interface MotionAssetRow {
  id: string;
  mediaVersionId: string;
  role: "motion_video" | "hero_cover";
  storagePath: string;
  fileSizeBytes: number;
}

export interface MotionDraftDeps {
  /** The exercise must exist; returns false otherwise. Never trusts a client-supplied boolean. */
  exerciseExists(exerciseId: string): Promise<boolean>;
  /** The single active working-state version for this exercise, if any (never Published/Trash/Archived). */
  findActiveWorkingVersion(exerciseId: string): Promise<MotionVersionRow | null>;
  /** Next positive version_number for a brand new version of this exercise. */
  nextVersionNumber(exerciseId: string): Promise<number>;
  insertDraftVersion(input: {
    exerciseId: string;
    versionNumber: number;
    demonstratorKey: DemonstratorKey;
    createdBy: string;
  }): Promise<MotionVersionRow>;
  /** Compensation only: removes a version this same call just created and that has no audit history yet. */
  deleteVersion(versionId: string): Promise<void>;
  findMotionVideoAsset(mediaVersionId: string): Promise<MotionAssetRow | null>;
  uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Compensation / replacement cleanup only. Must never be called with the current Published object's path. */
  removeObject(path: string): Promise<void>;
  /**
   * Atomically upserts the motion_video asset row and appends its audit
   * event(s) in one transaction (see finalize_exercise_motion_video_asset
   * in the follow-up migration) - there is no separate insert/update-asset
   * step and no separate insert-event step, so there is no window in which
   * one exists without the other.
   */
  finalizeAsset(input: {
    mediaVersionId: string;
    isNewDraft: boolean;
    storagePath: string;
    mimeType: string;
    fileSizeBytes: number;
    width: number;
    height: number;
    durationMs: number;
    frameRate: number | null;
    checksumSha256: string | null;
    actorUserId: string;
    replacedPrevious: boolean;
  }): Promise<MotionAssetRow>;
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
      existing: { assetId: string; storagePath: string; fileSizeBytes: number };
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
 * one Motion Video. See the module doc for how an unverified frame rate is
 * handled.
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

  const existingVersion = await deps.findActiveWorkingVersion(input.exerciseId);

  let version: MotionVersionRow;
  let wasNewDraft = false;

  if (!existingVersion) {
    const versionNumber = await deps.nextVersionNumber(input.exerciseId);
    version = await deps.insertDraftVersion({
      exerciseId: input.exerciseId,
      versionNumber,
      demonstratorKey: DEFAULT_DEMONSTRATOR_KEY,
      createdBy: input.actorUserId,
    });
    wasNewDraft = true;
  } else if (existingVersion.status !== "draft") {
    // media_ready / qa_passed / rejected / replacement_required: never
    // silently overwritten. Nothing was written; report the conflict.
    return { status: "conflict", currentStatus: existingVersion.status };
  } else {
    version = existingVersion;
  }

  const existingAsset = await deps.findMotionVideoAsset(version.id);

  if (existingAsset && !input.confirmReplace) {
    // A brand-new Draft never already has an asset, so this branch can only
    // be reached when reusing an existing Draft - nothing was written.
    return {
      status: "needs_confirmation",
      existing: {
        assetId: existingAsset.id,
        storagePath: existingAsset.storagePath,
        fileSizeBytes: existingAsset.fileSizeBytes,
      },
    };
  }

  const isReplacement = !!existingAsset;
  const replacementToken = isReplacement ? cryptoRandomToken() : undefined;
  const storagePath = buildMotionVideoStoragePath(input.exerciseId, version.id, replacementToken);

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

  let asset: MotionAssetRow;
  try {
    asset = await deps.finalizeAsset({
      mediaVersionId: version.id,
      isNewDraft: wasNewDraft,
      storagePath,
      mimeType: input.declaredMimeType,
      fileSizeBytes: input.fileBytes.byteLength,
      width: input.declaredWidth,
      height: input.declaredHeight,
      durationMs: input.declaredDurationMs,
      frameRate: input.verifiedFrameRate,
      checksumSha256,
      actorUserId: input.actorUserId,
      replacedPrevious: isReplacement,
    });
  } catch (err) {
    // The asset row and its audit event(s) are written atomically (one
    // transaction - see finalize_exercise_motion_video_asset), so a
    // failure here means NEITHER was written. Compensate the Storage
    // upload and, for a brand-new Draft, the empty version row.
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

  // Only now, with the Draft and its asset+events all durably established,
  // is it safe to remove the superseded object during a replacement.
  if (isReplacement && existingAsset && existingAsset.storagePath !== storagePath) {
    await safeRemoveObject(deps, existingAsset.storagePath);
  }

  return {
    status: "success",
    mediaVersionId: version.id,
    versionNumber: version.versionNumber,
    demonstratorKey: version.demonstratorKey,
    wasNewDraft,
    wasReplacement: isReplacement,
    assetId: asset.id,
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
