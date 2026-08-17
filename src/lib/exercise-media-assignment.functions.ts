import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ASSETS_BUCKET } from "@/lib/media-paths";
import { MEDIA_INBOX_BUCKET } from "@/services/media-inbox.service";

type AssignmentRole = "thumbnail" | "main" | "guide" | "demo";
function extensionOf(path: string): string {
  const fileName = path.split("/").pop() ?? "";
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export const assignExerciseMediaServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
    const userId = String(context.userId);

    if (!data.sourcePath.startsWith(`${userId}/`)) {
      throw new Error("Forbidden media path");
    }

    const { data: sourceBlob, error: downloadError } =
      await supabaseAdmin.storage
        .from(MEDIA_INBOX_BUCKET)
        .download(data.sourcePath);

    if (downloadError || !sourceBlob) {
      throw new Error(downloadError?.message ?? "Media file not found");
    }

    const extension = extensionOf(data.sourcePath);

    if (!extension) {
      throw new Error("Media file has no extension");
    }

    const destinationPath =
      `exercises/${data.exerciseId}/${data.role}.${extension}`;

    const { data: existingFiles, error: listError } =
      await supabaseAdmin.storage
        .from(ASSETS_BUCKET)
        .list(`exercises/${data.exerciseId}`, {
          limit: 100,
        });

    if (listError) {
      throw new Error(listError.message);
    }

    const rolePrefix = `${data.role}.`;
    const existing = (existingFiles ?? []).find((file) =>
      file.name.toLowerCase().startsWith(rolePrefix),
    );

    if (existing && !data.replace) {
      return {
        status: "exists" as const,
        existingPath: `exercises/${data.exerciseId}/${existing.name}`,
      };
    }

    if (existing) {
      const { error: removeError } = await supabaseAdmin.storage
        .from(ASSETS_BUCKET)
        .remove([`exercises/${data.exerciseId}/${existing.name}`]);

      if (removeError) {
        throw new Error(removeError.message);
      }
    }

    const { error: uploadError } = await supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .upload(destinationPath, sourceBlob, {
        contentType: sourceBlob.type || undefined,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    return {
      status: "assigned" as const,
      destinationPath,
    };
  });