/**
 * Exercise Media V2 — Motion Video Draft upload server functions.
 *
 * Thin TanStack Start server functions wiring the real service-role
 * Supabase client to the pure, unit-tested orchestration in
 * exercise-motion-draft-core.ts. All authorization and business logic
 * decisions live there or in the shared `requireAdminAuth` middleware
 * (unchanged, already used by exercise-media-assignment.functions.ts) -
 * this file's only job is translating between HTTP input, Supabase rows,
 * and that pure function's inputs/outputs.
 *
 * `types.ts` (auto-generated from a deployed Supabase project) does not
 * yet include exercise_media_versions/exercise_media_assets/
 * exercise_media_asset_events, because the migration that creates them has
 * been merged into this repo but deliberately has NOT been applied to any
 * remote Supabase project in this sprint (see the PR body). Regenerating
 * `types.ts` requires introspecting a live schema that does not exist yet,
 * so the handful of queries against these three tables below go through
 * `db`, a narrowly-scoped, clearly-commented untyped view of the same
 * client - contained to this one file rather than spread across the
 * codebase, and safe to replace with generated types the moment the
 * migration is applied somewhere real.
 */
import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { requireAdminAuth } from "@/integrations/supabase/admin-middleware";
import { ASSETS_BUCKET } from "@/lib/media-paths";
import { MEDIA_INBOX_BUCKET } from "@/services/media-inbox.service";
import {
  MOTION_VIDEO_MIME_TYPE,
  WORKING_STATUSES,
  isUuid,
  type DemonstratorKey,
} from "@/lib/exercise-media-v2";
import {
  performMotionDraftUpload,
  type MotionAssetRow,
  type MotionDraftDeps,
  type MotionVersionRow,
} from "@/lib/exercise-motion-draft-core";

function toVersionRow(row: {
  id: string;
  exercise_id: string;
  version_number: number;
  demonstrator_key: string;
  status: string;
}): MotionVersionRow {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    versionNumber: row.version_number,
    demonstratorKey: row.demonstrator_key as DemonstratorKey,
    status: row.status,
  };
}

function toAssetRow(row: {
  id: string;
  media_version_id: string;
  role: string;
  storage_path: string;
  file_size_bytes: number;
}): MotionAssetRow {
  return {
    id: row.id,
    mediaVersionId: row.media_version_id,
    role: row.role as MotionAssetRow["role"],
    storagePath: row.storage_path,
    fileSizeBytes: row.file_size_bytes,
  };
}

/**
 * Builds the real dependency object for performMotionDraftUpload, backed
 * by the service-role client. `adminSupabase` is loaded by the caller
 * (never imported at module top level - route/`.functions.ts` files ship
 * to the client bundle, so the service-role client is only ever reached
 * through the dynamic `await import("@/integrations/supabase/client.server")`
 * already used by exercise-media-assignment.functions.ts).
 */
function buildLiveDeps(adminSupabase: unknown): MotionDraftDeps {
  // See the file-level comment: exercise_media_* tables predate the
  // generated Database types because the migration has not been applied to
  // any remote project yet. This cast is the single, contained place that
  // reflects that reality.
  const db = adminSupabase as unknown as {
    from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
    rpc(
      fn: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { message: string } | null }>;
    storage: {
      from(bucket: string): {
        upload(
          path: string,
          body: Uint8Array,
          opts: { contentType: string; upsert: boolean },
        ): Promise<{ error: { message: string } | null }>;
        remove(paths: string[]): Promise<{ error: { message: string } | null }>;
      };
    };
  };

  return {
    async exerciseExists(exerciseId) {
      const { data, error } = await db
        .from("exercises")
        .select("id")
        .eq("id", exerciseId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return !!data;
    },

    async findActiveWorkingVersion(exerciseId) {
      const { data, error } = await db
        .from("exercise_media_versions")
        .select("id, exercise_id, version_number, demonstrator_key, status")
        .eq("exercise_id", exerciseId)
        .in("status", WORKING_STATUSES)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toVersionRow(data) : null;
    },

    async nextVersionNumber(exerciseId) {
      const { data, error } = await db
        .from("exercise_media_versions")
        .select("version_number")
        .eq("exercise_id", exerciseId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.version_number ?? 0) + 1;
    },

    async insertDraftVersion(input) {
      const { data, error } = await db
        .from("exercise_media_versions")
        .insert({
          exercise_id: input.exerciseId,
          version_number: input.versionNumber,
          demonstrator_key: input.demonstratorKey,
          status: "draft",
          created_by: input.createdBy,
        })
        .select("id, exercise_id, version_number, demonstrator_key, status")
        .single();
      if (error) throw new Error(error.message);
      return toVersionRow(data);
    },

    async deleteVersion(versionId) {
      const { error } = await db.from("exercise_media_versions").delete().eq("id", versionId);
      if (error) throw new Error(error.message);
    },

    async findMotionVideoAsset(mediaVersionId) {
      const { data, error } = await db
        .from("exercise_media_assets")
        .select("id, media_version_id, role, storage_path, file_size_bytes")
        .eq("media_version_id", mediaVersionId)
        .eq("role", "motion_video")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toAssetRow(data) : null;
    },

    async uploadObject(path, bytes, contentType) {
      const { error } = await db.storage
        .from(ASSETS_BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error(error.message);
    },

    async removeObject(path) {
      const { error } = await db.storage.from(ASSETS_BUCKET).remove([path]);
      if (error) throw new Error(error.message);
    },

    async finalizeAsset(input) {
      // One atomic transaction (asset upsert + audit event(s)) via the
      // follow-up migration's finalize_exercise_motion_video_asset() -
      // see supabase/migrations/20260902084229_exercise_media_v2_followup.sql.
      // Service-role-only (EXECUTE is revoked from anon/authenticated).
      const { data, error } = await db.rpc("finalize_exercise_motion_video_asset", {
        p_media_version_id: input.mediaVersionId,
        p_is_new_draft: input.isNewDraft,
        p_storage_path: input.storagePath,
        p_mime_type: input.mimeType,
        p_file_size_bytes: input.fileSizeBytes,
        p_width: input.width,
        p_height: input.height,
        p_duration_ms: input.durationMs,
        p_frame_rate: input.frameRate,
        p_checksum_sha256: input.checksumSha256,
        p_actor_user_id: input.actorUserId,
        p_replaced_previous: input.replacedPrevious,
      });
      if (error) throw new Error(error.message);
      return {
        id: data as string,
        mediaVersionId: input.mediaVersionId,
        role: "motion_video",
        storagePath: input.storagePath,
        fileSizeBytes: input.fileSizeBytes,
      };
    },

    async sha256(bytes) {
      return createHash("sha256").update(bytes).digest("hex");
    },
  };
}

/**
 * Read-only status check so the UI can show "Draft exists" / "conflict"
 * banners before the Admin even attaches a file. Admin-only; never writes.
 */
export const getExerciseMotionDraftStatusServer = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as Record<string, unknown>;
    const exerciseId = String(i.exerciseId ?? "");
    if (!isUuid(exerciseId)) throw new Error("Invalid exercise id");
    return { exerciseId };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const deps = buildLiveDeps(supabaseAdmin);

    if (!(await deps.exerciseExists(data.exerciseId))) {
      return { status: "not_found" as const };
    }

    const active = await deps.findActiveWorkingVersion(data.exerciseId);
    if (!active) {
      return { status: "no_active_version" as const };
    }
    if (active.status !== "draft") {
      return { status: "conflict" as const, currentStatus: active.status };
    }

    const asset = await deps.findMotionVideoAsset(active.id);
    return {
      status: "draft_exists" as const,
      versionNumber: active.versionNumber,
      demonstratorKey: active.demonstratorKey,
      hasMotionVideoAsset: !!asset,
    };
  });

export const uploadExerciseMotionDraftServer = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as Record<string, unknown>;

    const exerciseId = String(i.exerciseId ?? "");
    const inboxSourcePath = String(i.inboxSourcePath ?? "");
    const confirmReplace = Boolean(i.confirmReplace);
    const declaredWidth = Number(i.declaredWidth);
    const declaredHeight = Number(i.declaredHeight);
    const declaredDurationMs = Number(i.declaredDurationMs);

    if (!isUuid(exerciseId)) throw new Error("Invalid exercise id");
    if (!inboxSourcePath) throw new Error("Missing source media path");
    if (!Number.isFinite(declaredWidth) || !Number.isFinite(declaredHeight)) {
      throw new Error("Missing detected video dimensions");
    }
    if (!Number.isFinite(declaredDurationMs)) {
      throw new Error("Missing detected video duration");
    }

    return {
      exerciseId,
      inboxSourcePath,
      confirmReplace,
      declaredWidth,
      declaredHeight,
      declaredDurationMs,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = String(context.userId);

    // Same ownership convention as assignExerciseMediaServer: the Inbox
    // staging object must belong to the calling (already-verified-Admin)
    // user. A non-Admin request never reaches this line at all - the
    // requireAdminAuth middleware above throws first.
    if (!data.inboxSourcePath.startsWith(`${userId}/`)) {
      throw new Error("Forbidden media path");
    }

    const { data: sourceBlob, error: downloadError } = await supabaseAdmin.storage
      .from(MEDIA_INBOX_BUCKET)
      .download(data.inboxSourcePath);

    if (downloadError || !sourceBlob) {
      throw new Error(downloadError?.message ?? "Media file not found");
    }

    const fileBytes = new Uint8Array(await sourceBlob.arrayBuffer());
    const declaredMimeType = sourceBlob.type || MOTION_VIDEO_MIME_TYPE;

    const deps = buildLiveDeps(supabaseAdmin);

    const result = await performMotionDraftUpload(deps, {
      exerciseId: data.exerciseId,
      actorUserId: userId,
      fileBytes,
      declaredMimeType,
      declaredWidth: data.declaredWidth,
      declaredHeight: data.declaredHeight,
      declaredDurationMs: data.declaredDurationMs,
      confirmReplace: data.confirmReplace,
      // Always null on this real path today: neither this server nor the
      // browser can decode video to genuinely measure frame rate in this
      // environment. See exercise-motion-draft-core.ts's module doc - this
      // is no longer a blocker (the follow-up migration allows a NULL,
      // honestly-unverified frame_rate on a motion_video row), so the
      // Draft upload still completes successfully. Do not change this to
      // `30`; that would fabricate a measurement the sprint explicitly
      // forbids.
      verifiedFrameRate: null,
    });

    // Draft preview URLs are handed back only through this Admin-only
    // response - never persisted, and never exposed through the normal
    // Published-only client queries against exercise_media_versions/
    // exercise_media_assets. The existing bucket-wide "authenticated can
    // read exercise-assets" Storage policy already applies to every object
    // in this bucket (legacy included), so signing here is not a new
    // exposure; it is short-lived (5 minutes, well under the 1-hour
    // SIGNED_URL_TTL used for general media browsing) specifically because
    // it exists only for this one immediate post-upload preview.
    if (result.status === "success") {
      const PREVIEW_TTL_SECONDS = 300;
      const { data: signed, error: signError } = await supabaseAdmin.storage
        .from(ASSETS_BUCKET)
        .createSignedUrl(result.storagePath, PREVIEW_TTL_SECONDS);
      return {
        ...result,
        previewUrl: signError ? null : (signed?.signedUrl ?? null),
      };
    }

    return result;
  });
