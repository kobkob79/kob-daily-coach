import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export const ABOUT_MEDIA_BUCKET = "viora-team-media";
export const ABOUT_MEDIA_SUBJECTS = ["team", "kobi", "adam", "daniel", "maya", "shiran"] as const;
export const ABOUT_MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ABOUT_MEDIA_MAX_BYTES = 6 * 1024 * 1024;

export type AboutMediaSubject = (typeof ABOUT_MEDIA_SUBJECTS)[number];

export interface AboutMediaRecord {
  id: string;
  subject: AboutMediaSubject;
  storage_bucket: typeof ABOUT_MEDIA_BUCKET;
  storage_path: string;
  caption: string | null;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublishedAboutMedia extends AboutMediaRecord {
  publicUrl: string;
}

export function validateAboutMediaFile(file: Pick<File, "size" | "type">): string | null {
  if (!ABOUT_MEDIA_MIME_TYPES.includes(file.type as (typeof ABOUT_MEDIA_MIME_TYPES)[number])) {
    return "אפשר להעלות רק תמונות JPEG, PNG או WebP.";
  }
  if (file.size > ABOUT_MEDIA_MAX_BYTES) return "התמונה גדולה מ־6MB.";
  return null;
}

export function getAboutMediaLimit(subject: AboutMediaSubject): number {
  return subject === "team" ? 1 : 5;
}

export async function fetchPublishedAboutMedia(
  subject?: AboutMediaSubject,
): Promise<PublishedAboutMedia[]> {
  const client = supabase as unknown as SupabaseClient;
  let query = client
    .from("about_media")
    .select(
      "id,subject,storage_bucket,storage_path,caption,alt_text,sort_order,is_primary,is_active,created_at,updated_at",
    )
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");
  if (subject) query = query.eq("subject", subject);
  const { data, error } = await query;
  if (error) throw new Error("ABOUT_MEDIA_UNAVAILABLE");
  return (data as AboutMediaRecord[]).map((item) => ({
    ...item,
    publicUrl: client.storage.from(item.storage_bucket).getPublicUrl(item.storage_path).data
      .publicUrl,
  }));
}

export function primaryAboutMedia(
  items: readonly PublishedAboutMedia[],
  subject: AboutMediaSubject,
) {
  return items.find((item) => item.subject === subject && item.is_primary) ?? null;
}
