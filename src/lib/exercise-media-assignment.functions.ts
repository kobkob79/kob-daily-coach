import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/integrations/supabase/admin-middleware";
import { ASSETS_BUCKET } from "@/lib/media-paths";
import { MEDIA_INBOX_BUCKET } from "@/services/media-inbox.service";

type AssignmentRole = "thumbnail" | "main" | "guide" | "demo";
function extensionOf(path: string): string {
  const fileName = path.split("/").pop() ?? "";
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export const assignExerciseMediaServer = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as Record<string, unknown>;

    const sourcePath = String(i.sourcePath ?? "");
    const exerciseId = String(i.exerciseId ?? "");
    const role = String(i.role ?? "") as AssignmentRole;
    const replace = Boolean(i.replace);

    if (!sourcePath) throw new Error("Missing source media path");
    if (!exerciseId) throw new Error("Missing exercise id");

    if (!["thumbnail", "main", "guide", "demo"].includes(role)) {
      throw new Error("Invalid media role");
    }

    return {
      sourcePath,
      exerciseId,
      role,
      replace,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = String(context.userId);

    if (!data.sourcePath.startsWith(`${userId}/`)) {
      throw new Error("Forbidden media path");
    }

    const { data: sourceBlob, error: downloadError } = await supabaseAdmin.storage
      .from(MEDIA_INBOX_BUCKET)
      .download(data.sourcePath);

    if (downloadError || !sourceBlob) {
      throw new Error(downloadError?.message ?? "Media file not found");
    }

    const extension = extensionOf(data.sourcePath);

    if (!extension) {
      throw new Error("Media file has no extension");
    }

    const destinationPath = `exercises/${data.exerciseId}/${data.role}.${extension}`;

    const { data: existingFiles, error: listError } = await supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .list(`exercises/${data.exerciseId}`, {
        limit: 100,
      });

    if (listError) {
      throw new Error(listError.message);
    }

    const rolePrefix = `${data.role}.`;
    // Every existing object for this role, regardless of extension - a
    // previous version of this handler only located the first match, which
    // could leave a stale sibling (e.g. an old demo.mov next to a freshly
    // assigned demo.mp4) behind after a replace.
    const existingRoleFiles = (existingFiles ?? []).filter((file) =>
      file.name.toLowerCase().startsWith(rolePrefix),
    );

    if (existingRoleFiles.length > 0 && !data.replace) {
      return {
        status: "exists" as const,
        existingPath: `exercises/${data.exerciseId}/${existingRoleFiles[0].name}`,
      };
    }

    // Upload the new file BEFORE touching any existing one: if the upload
    // fails, the currently-assigned media for this role must stay active
    // rather than being left with nothing. `upsert: true` makes the
    // same-extension replacement case (new path === old path) a single
    // atomic overwrite instead of a delete-then-insert gap.
    const { error: uploadError } = await supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .upload(destinationPath, sourceBlob, {
        contentType: sourceBlob.type || undefined,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    // Only now, with the new file durably in place, remove every *other*
    // sibling for this role (a different extension, or a leftover
    // duplicate) so at most one file per role exists afterward. Best-effort:
    // the assignment itself already succeeded, so a cleanup failure here
    // must not be reported as a failed assignment.
    const staleSiblingPaths = existingRoleFiles
      .map((file) => `exercises/${data.exerciseId}/${file.name}`)
      .filter((path) => path !== destinationPath);

    if (staleSiblingPaths.length > 0) {
      const { error: removeError } = await supabaseAdmin.storage
        .from(ASSETS_BUCKET)
        .remove(staleSiblingPaths);

      if (removeError) {
        console.error(
          `[assignExerciseMediaServer] failed to remove stale ${data.role} siblings for exercise ${data.exerciseId}`,
          removeError,
        );
      }
    }

    return {
      status: "assigned" as const,
      destinationPath,
    };
  });
