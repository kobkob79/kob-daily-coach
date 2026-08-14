import { supabase } from "./base";

export const MEDIA_INBOX_BUCKET = "media-inbox";

export async function uploadMediaInboxFile(file: File): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    throw new Error("Not signed in");
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const safeName = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "media";

  const path = `${user.id}/${Date.now()}-${safeName}.${ext}`;

  const { error } = await supabase.storage
    .from(MEDIA_INBOX_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

  if (error) throw error;

  return path;
}
