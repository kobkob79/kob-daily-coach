/**
 * Media Inbox → exercise assignment server function.
 *
 * Thin TanStack Start wiring of the real service-role Supabase client to
 * the pure, unit-tested orchestration in exercise-media-assignment-core.ts
 * (VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001, findings F3/F4/F5). All
 * validation and write-ordering/compensation decisions live there; this
 * file's only job is translating between HTTP input, Supabase Storage
 * responses, and that pure function's inputs/outputs - and turning a
 * failure outcome into a safe, allowlisted error (see safe-server-error.ts)
 * rather than ever passing a raw Supabase error through to the client or
 * this app's own logs.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/integrations/supabase/admin-middleware";
import { ASSETS_BUCKET } from "@/lib/media-paths";
import { MEDIA_INBOX_BUCKET } from "@/services/media-inbox.service";
import {
  performExerciseMediaAssignment,
  type AssignmentDeps,
  type DownloadResult,
  type StorageFile,
  type StorageOpResult,
} from "@/lib/exercise-media-assignment-core";
import { reportSafeServerError, type SafeErrorCategory } from "@/lib/safe-server-error";

/** Minimal shape this file needs from the real (or a test) Supabase client - kept narrow and easy to fake. */
interface StorageClient {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: unknown }>;
      list(
        folder: string,
        opts: { limit: number },
      ): Promise<{ data: { name: string }[] | null; error: unknown }>;
      upload(
        path: string,
        body: Uint8Array,
        opts: { contentType: string | undefined; upsert: boolean },
      ): Promise<{ error: unknown }>;
      remove(paths: string[]): Promise<{ error: unknown }>;
    };
  };
}

/**
 * Translates the real Supabase client's Storage calls into the plain,
 * error-message-free shapes performExerciseMediaAssignment()'s deps
 * interface expects - a Supabase error is checked for presence only and
 * never forwarded (its message/code/details/hint could carry sensitive
 * detail; see safe-server-error.ts). The handler below is the single place
 * that turns a resulting failure status into a safe, logged category.
 */
function buildLiveDeps(client: StorageClient): AssignmentDeps {
  return {
    async downloadSource(sourcePath): Promise<DownloadResult> {
      const { data: blob, error } = await client.storage
        .from(MEDIA_INBOX_BUCKET)
        .download(sourcePath);
      if (error || !blob) return { found: false };
      return {
        found: true,
        bytes: new Uint8Array(await blob.arrayBuffer()),
        contentType: blob.type || null,
      };
    },

    async listExerciseFolder(exerciseId): Promise<StorageFile[] | { failed: true }> {
      const { data, error } = await client.storage
        .from(ASSETS_BUCKET)
        .list(`exercises/${exerciseId}`, { limit: 100 });
      if (error) return { failed: true };
      return data ?? [];
    },

    async upload(destinationPath, bytes, contentType): Promise<StorageOpResult> {
      const { error } = await client.storage.from(ASSETS_BUCKET).upload(destinationPath, bytes, {
        contentType,
        upsert: true,
      });
      return error ? { ok: false } : { ok: true };
    },

    async remove(paths): Promise<StorageOpResult> {
      const { error } = await client.storage.from(ASSETS_BUCKET).remove(paths);
      return error ? { ok: false } : { ok: true };
    },
  };
}

const FAILURE_CATEGORY: Record<
  Exclude<
    Awaited<ReturnType<typeof performExerciseMediaAssignment>>["status"],
    "exists" | "assigned" | "assigned_with_cleanup_warning"
  >,
  SafeErrorCategory
> = {
  invalid: "VALIDATION_FAILED",
  forbidden: "FORBIDDEN",
  not_found: "SOURCE_NOT_FOUND",
  list_failed: "LIST_FAILED",
  upload_failed: "UPLOAD_FAILED",
};

export const assignExerciseMediaServer = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = String(context.userId);

    const i = (data ?? {}) as Record<string, unknown>;
    const exerciseId = typeof i.exerciseId === "string" ? i.exerciseId : undefined;
    const role = typeof i.role === "string" ? i.role : undefined;

    const deps = buildLiveDeps(supabaseAdmin as unknown as StorageClient);
    const result = await performExerciseMediaAssignment(deps, data, userId);

    if (result.status === "exists") {
      return { status: "exists" as const, existingPath: result.existingPath };
    }
    if (result.status === "assigned") {
      return { status: "assigned" as const, destinationPath: result.destinationPath };
    }
    if (result.status === "assigned_with_cleanup_warning") {
      // Assignment succeeded; Storage still needs manual cleanup of a
      // stale sibling. Never reported as a plain "assigned" - the caller
      // must be able to tell the two apart (see ExerciseAssignSheet.tsx).
      return {
        status: "assigned_with_cleanup_warning" as const,
        destinationPath: result.destinationPath,
      };
    }

    const safe = reportSafeServerError(FAILURE_CATEGORY[result.status], { exerciseId, role });
    throw new Error(safe.message);
  });
