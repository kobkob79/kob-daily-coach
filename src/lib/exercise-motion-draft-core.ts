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
 * ARCHITECTURAL BLOCKER (read before changing verifiedFrameRate):
 * The merged database (supabase/migrations/20260902065412_exercise_media_lifecycle_data.sql)
 * requires `exercise_media_assets.frame_rate = 30` (NOT NULL, exact match)
 * for every `motion_video` row, at every status including `draft`. Neither
 * the browser nor this trusted Node server can decode video to genuinely
 * measure frame rate in this environment (no ffprobe/mediainfo/WASM
 * decoder is installed, and none should be added silently just to make
 * this insert succeed). `verifiedFrameRate` is therefore always `null` on
 * the real HTTP path today (see exercise-motion-draft.functions.ts), and
 * `performMotionDraftUpload` deliberately refuses to call
 * `deps.insertMotionVideoAsset` without a genuine positive number for it -
 * it fails fast with `{ stage: "asset_metadata", reason: "architectural_blocker" }`
 * and fully compensates (removes the just-uploaded object, and the
 * just-created Draft row if it has no other history) rather than writing
 * `30` as a guess. Tests exercise the success path by injecting an
 * explicit `verifiedFrameRate`, exactly the way a future privileged
 * probing service would - see the PR body for the recommended smallest
 * safe fix (an isolated server-side probe, not implemented in this
 * sprint).
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
  resolveDemonstratorDefault,
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
  /** Position in the Core 150 catalogue, or null when unresolvable (always null today - see module doc). */
  resolveCore150Number(exerciseId: string): Promise<number | null>;
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
  insertMotionVideoAsset(input: {
    mediaVersionId: string;
    storagePath: string;
    mimeType: string;
    fileSizeBytes: number;
    width: number;
    height: number;
    durationMs: number;
    frameRate: number;
    checksumSha256: string | null;
  }): Promise<MotionAssetRow>;
  /** Replacement only: repoints the existing asset row at the newly uploaded object. */
  updateMotionVideoAssetPath(input: {
    assetId: string;
    storagePath: string;
    mimeType: string;
    fileSizeBytes: number;
    width: number;
    height: number;
    durationMs: number;
    frameRate: number;
    checksumSha256: string | null;
  }): Promise<MotionAssetRow>;
  insertEvent(input: {
    mediaVersionId: string;
    eventType: "created" | "asset_uploaded";
    toStatus: string | null;
    actorUserId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
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
   * A genuinely verified frame rate from a trusted source. Always `null` on
   * the real HTTP path today - see the module-level ARCHITECTURAL BLOCKER
   * comment. Tests inject a real number to exercise the success path.
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
    }
  | {
      status: "failure";
      stage: "storage_upload" | "asset_metadata" | "event_write";
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
  return errors;
}

/**
 * The full Draft-creation-or-reuse, upload, and compensation pipeline for
 * one Motion Video. See the module doc for the frame-rate blocker this
 * always hits on the real HTTP path today.
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
    const core150Number = await deps.resolveCore150Number(input.exerciseId);
    const demonstratorKey = resolveDemonstratorDefault(core150Number);
    const versionNumber = await deps.nextVersionNumber(input.exerciseId);
    version = await deps.insertDraftVersion({
      exerciseId: input.exerciseId,
      versionNumber,
      demonstratorKey,
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

  if (
    input.verifiedFrameRate === null ||
    input.verifiedFrameRate !== MOTION_VIDEO_REQUIRED_FRAME_RATE
  ) {
    // The architectural blocker: refuse to fabricate frame_rate. Compensate
    // fully - the object we just uploaded above is removed, and a
    // brand-new, still-history-free Draft row is removed too. An existing
    // Draft being *replaced* is left exactly as it was (its prior asset, if
    // any, is untouched) because that row has real history beyond this
    // call.
    await safeRemoveObject(deps, storagePath);
    if (wasNewDraft) {
      await safeDeleteVersion(deps, version.id);
    }
    return {
      status: "failure",
      stage: "asset_metadata",
      reason: "architectural_blocker",
    };
  }

  let checksumSha256: string | null = null;
  try {
    checksumSha256 = await deps.sha256(input.fileBytes);
  } catch {
    checksumSha256 = null; // optional per spec ("if safely calculated"); never blocks the upload.
  }

  const assetFields = {
    mimeType: input.declaredMimeType,
    fileSizeBytes: input.fileBytes.byteLength,
    width: input.declaredWidth,
    height: input.declaredHeight,
    durationMs: input.declaredDurationMs,
    frameRate: input.verifiedFrameRate,
    checksumSha256,
  };

  let asset: MotionAssetRow;
  try {
    asset =
      isReplacement && existingAsset
        ? await deps.updateMotionVideoAssetPath({
            assetId: existingAsset.id,
            storagePath,
            ...assetFields,
          })
        : await deps.insertMotionVideoAsset({
            mediaVersionId: version.id,
            storagePath,
            ...assetFields,
          });
  } catch (err) {
    await safeRemoveObject(deps, storagePath);
    if (wasNewDraft) {
      await safeDeleteVersion(deps, version.id);
    }
    return {
      status: "failure",
      stage: "asset_metadata",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  // Only now, with the Draft and its asset both durably established, is it
  // safe to remove the superseded object during a replacement.
  if (isReplacement && existingAsset && existingAsset.storagePath !== storagePath) {
    await safeRemoveObject(deps, existingAsset.storagePath);
  }

  try {
    if (wasNewDraft) {
      await deps.insertEvent({
        mediaVersionId: version.id,
        eventType: "created",
        toStatus: "draft",
        actorUserId: input.actorUserId,
        metadata: { role: "motion_video" },
      });
    }
    await deps.insertEvent({
      mediaVersionId: version.id,
      eventType: "asset_uploaded",
      toStatus: null,
      actorUserId: input.actorUserId,
      metadata: {
        role: "motion_video",
        fileSizeBytes: assetFields.fileSizeBytes,
        width: assetFields.width,
        height: assetFields.height,
        durationMs: assetFields.durationMs,
        replacedPreviousAsset: isReplacement,
      },
    });
  } catch (err) {
    // The Draft/asset are already durably correct at this point; a failed
    // audit write is reported but is not compensated by undoing the asset -
    // undoing a successful, valid asset write to "fix" an audit-log failure
    // would itself corrupt state. This is a known limitation - see PR body.
    return {
      status: "failure",
      stage: "event_write",
      reason: err instanceof Error ? err.message : String(err),
    };
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
