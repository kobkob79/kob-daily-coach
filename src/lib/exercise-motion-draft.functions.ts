/**
 * Exercise Media V2 — Motion Video Draft upload server functions.
 *
 * Thin TanStack Start server functions wiring the real service-role
 * Supabase client to the pure, unit-tested orchestration in
 * exercise-motion-draft-core.ts. All authorization and business logic
 * decisions live there or in the shared `requireAdminAuth` middleware
 * (unchanged, already used by exercise-media-assignment.functions.ts) -
 * this file's only job is translating between HTTP input, Supabase rows/
 * RPC outcomes, and that pure function's inputs/outputs.
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
import { WORKING_STATUSES, isUuid, type DemonstratorKey } from "@/lib/exercise-media-v2";
import {
  performMotionDraftUpload,
  type FinalizeAssetResult,
  type MotionDraftDeps,
  type ReserveDraftResult,
} from "@/lib/exercise-motion-draft-core";

interface LiveDb {
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
  const db = adminSupabase as unknown as LiveDb;

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

    async reserveDraft(input) {
      // Atomic Draft creation/reuse, serialized per exercise via an
      // advisory lock held for the RPC's own transaction - see
      // reserve_exercise_media_draft in the follow-up migration.
      // Service-role-only (EXECUTE is revoked from anon/authenticated).
      const { data, error } = await db.rpc("reserve_exercise_media_draft", {
        p_exercise_id: input.exerciseId,
        p_actor_user_id: input.actorUserId,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as {
        outcome: "reserved" | "conflict";
        media_version_id: string | null;
        version_number: number | null;
        demonstrator_key: string | null;
        is_new_draft: boolean | null;
        blocked_status: string | null;
      };
      if (row.outcome === "conflict") {
        return {
          outcome: "conflict",
          currentStatus: row.blocked_status as string,
        } satisfies ReserveDraftResult;
      }
      return {
        outcome: "reserved",
        version: {
          id: row.media_version_id as string,
          versionNumber: row.version_number as number,
          demonstratorKey: row.demonstrator_key as DemonstratorKey,
        },
        isNewDraft: !!row.is_new_draft,
      } satisfies ReserveDraftResult;
    },

    async deleteVersion(versionId) {
      const { error } = await db.from("exercise_media_versions").delete().eq("id", versionId);
      if (error) throw new Error(error.message);
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
      // One atomic, re-checked transaction (parent-version lock + asset
      // lock + upsert + audit event(s)) via the follow-up migration's
      // finalize_exercise_motion_video_asset() - see
      // supabase/migrations/20260902084229_exercise_media_v2_followup.sql.
      // Service-role-only (EXECUTE is revoked from anon/authenticated).
      const { data, error } = await db.rpc("finalize_exercise_motion_video_asset", {
        p_media_version_id: input.mediaVersionId,
        p_confirm_replace: input.confirmReplace,
        p_storage_path: input.storagePath,
        p_mime_type: input.mimeType,
        p_file_size_bytes: input.fileSizeBytes,
        p_width: input.width,
        p_height: input.height,
        p_duration_ms: input.durationMs,
        p_frame_rate: input.frameRate,
        p_checksum_sha256: input.checksumSha256,
        p_actor_user_id: input.actorUserId,
      });
      if (error) throw new Error(error.message);
      const row = (Array.isArray(data) ? data[0] : data) as {
        outcome: "finalized" | "needs_confirmation" | "version_not_found" | "version_not_draft";
        asset_id: string | null;
        previous_storage_path: string | null;
        was_replacement: boolean | null;
        blocked_status: string | null;
      };

      switch (row.outcome) {
        case "finalized":
          return {
            outcome: "finalized",
            assetId: row.asset_id as string,
            previousStoragePath: row.previous_storage_path,
            wasReplacement: !!row.was_replacement,
          } satisfies FinalizeAssetResult;
        case "needs_confirmation":
          return {
            outcome: "needs_confirmation",
            existingAssetId: row.asset_id as string,
            previousStoragePath: row.previous_storage_path as string,
          } satisfies FinalizeAssetResult;
        case "version_not_found":
          return { outcome: "version_not_found" } satisfies FinalizeAssetResult;
        case "version_not_draft":
          return {
            outcome: "version_not_draft",
            blockedStatus: row.blocked_status as string,
          } satisfies FinalizeAssetResult;
      }
    },

    async sha256(bytes) {
      return createHash("sha256").update(bytes).digest("hex");
    },
  };
}

/**
 * Read-only status check so the UI can show "Draft exists" / "conflict"
 * banners before the Admin even attaches a file. Admin-only; never writes.
 * Deliberately independent of MotionDraftDeps/reserveDraft/finalizeAsset:
 * this is an advisory, best-effort read for the UI, not part of the
 * authoritative, locked upload pipeline - a stale read here can only ever
 * make the UI show an outdated banner, never cause an incorrect write,
 * since uploadExerciseMotionDraftServer's real checks happen inside the
 * atomic RPCs regardless of what this endpoint last reported.
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
    const db = supabaseAdmin as unknown as LiveDb;

    const { data: exerciseRow, error: exerciseError } = await db
      .from("exercises")
      .select("id")
      .eq("id", data.exerciseId)
      .maybeSingle();
    if (exerciseError) throw new Error(exerciseError.message);
    if (!exerciseRow) return { status: "not_found" as const };

    const { data: active, error: versionError } = await db
      .from("exercise_media_versions")
      .select("id, version_number, demonstrator_key, status")
      .eq("exercise_id", data.exerciseId)
      .in("status", WORKING_STATUSES)
      .maybeSingle();
    if (versionError) throw new Error(versionError.message);
    if (!active) return { status: "no_active_version" as const };
    if (active.status !== "draft") {
      return { status: "conflict" as const, currentStatus: active.status as string };
    }

    const { data: asset, error: assetError } = await db
      .from("exercise_media_assets")
      .select("id")
      .eq("media_version_id", active.id)
      .eq("role", "motion_video")
      .maybeSingle();
    if (assetError) throw new Error(assetError.message);

    return {
      status: "draft_exists" as const,
      versionNumber: active.version_number as number,
      demonstratorKey: active.demonstrator_key as DemonstratorKey,
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

    // The MIME type actually returned by the trusted Storage download -
    // never relabeled. An empty or non-"video/mp4" value is rejected by
    // performMotionDraftUpload's metadata validation (which runs before
    // any exerciseExists/uploadObject call), exactly like any other wrong
    // MIME type; nothing is ever uploaded to the V2 target path on that
    // path. There is deliberately no `|| MOTION_VIDEO_MIME_TYPE` fallback
    // here - that would fabricate a MIME type Storage did not actually
    // report.
    const declaredMimeType = sourceBlob.type;

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
      // is not a blocker (the follow-up migration allows a NULL,
      // honestly-unverified frame_rate on a motion_video row), so the
      // Draft upload still completes successfully. Do not change this to
      // `30`; that would fabricate a measurement the sprint explicitly
      // forbids.
      verifiedFrameRate: null,
    });

    if (result.status !== "success") {
      return result;
    }

    // Staging cleanup: best-effort only, and only after a real, durable
    // success. A failure here must never undo the Draft that was just
    // finalized, and must never touch any Inbox object other than the
    // exact one this call itself downloaded from - reported back as a
    // non-blocking diagnostic, never thrown.
    let stagingCleanup: "removed" | "failed" = "removed";
    try {
      const { error: cleanupError } = await supabaseAdmin.storage
        .from(MEDIA_INBOX_BUCKET)
        .remove([data.inboxSourcePath]);
      if (cleanupError) stagingCleanup = "failed";
    } catch {
      stagingCleanup = "failed";
    }

    // Draft preview URLs are handed back only through this Admin-only
    // response - never persisted, and never exposed through the normal
    // Published-only client queries against exercise_media_versions/
    // exercise_media_assets. The existing bucket-wide "authenticated can
    // read exercise-assets" Storage policy already applies to every object
    // in this bucket (legacy included), so signing here is not a new
    // exposure; it is short-lived (5 minutes, well under the 1-hour
    // SIGNED_URL_TTL used for general media browsing) specifically because
    // it exists only for this one immediate post-upload preview.
    const PREVIEW_TTL_SECONDS = 300;
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .createSignedUrl(result.storagePath, PREVIEW_TTL_SECONDS);

    return {
      ...result,
      previewUrl: signError ? null : (signed?.signedUrl ?? null),
      stagingCleanup,
    };
  });
