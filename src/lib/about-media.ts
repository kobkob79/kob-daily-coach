export const ABOUT_MEDIA_BUCKET = "viora-team-media";
export const ABOUT_MEDIA_SUBJECTS = ["team", "kobi", "adam", "daniel", "maya", "shiran"] as const;
export const ABOUT_MEDIA_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ABOUT_MEDIA_MAX_BYTES = 6 * 1024 * 1024;
export const ABOUT_MEDIA_OPTIMIZED_TARGET_BYTES = Math.floor(5.5 * 1024 * 1024);
export const ABOUT_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const ABOUT_MEDIA_CACHE_MS = 45 * 60_000;

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

export interface PublishedAboutMedia {
  id: string;
  subject: AboutMediaSubject;
  caption: string | null;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  signedUrl: string;
}

export interface AdminAboutMediaRecord extends AboutMediaRecord {
  signedUrl: string | null;
}

export function validateAboutMediaFile(file: Pick<File, "size" | "type">): string | null {
  if (!ABOUT_MEDIA_MIME_TYPES.includes(file.type as (typeof ABOUT_MEDIA_MIME_TYPES)[number])) {
    return "אפשר להעלות רק תמונות JPEG, PNG או WebP.";
  }
  if (file.size > ABOUT_MEDIA_MAX_BYTES) return "התמונה גדולה מ־6MB.";
  if (file.size === 0) return "קובץ התמונה ריק.";
  return null;
}

/** Validation for a local source image before browser optimization. */
export function validateAboutMediaSourceFile(file: Pick<File, "size" | "type">): string | null {
  if (!ABOUT_MEDIA_MIME_TYPES.includes(file.type as (typeof ABOUT_MEDIA_MIME_TYPES)[number])) {
    return "אפשר לבחור רק תמונות JPEG, PNG או WebP.";
  }
  if (file.size === 0) return "קובץ התמונה ריק.";
  return null;
}

export function getAboutMediaLimit(subject: AboutMediaSubject): number {
  return ABOUT_MEDIA_SUBJECTS.includes(subject) ? 5 : 0;
}

export function primaryFirst(items: readonly PublishedAboutMedia[]) {
  return [...items].sort((left, right) => Number(right.is_primary) - Number(left.is_primary));
}

export function primaryAboutMedia(
  items: readonly PublishedAboutMedia[],
  subject: AboutMediaSubject,
) {
  return items.find((item) => item.subject === subject && item.is_primary) ?? null;
}
