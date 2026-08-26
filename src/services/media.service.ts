/**
 * Generic media service over Supabase Storage.
 *
 * Bucket- and prefix-agnostic on purpose: the same functions serve character
 * identity images, marketing assets, exercise assets and future videos.
 * Listing is paginated and signing happens per page only, so a folder with
 * thousands of objects stays cheap to browse.
 */
import { supabase, ServiceError } from "./base";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type MediaSupabaseClient = SupabaseClient<Database>;

export type MediaKind = "image" | "video" | "audio" | "other";

export interface MediaItem {
  /** Full object path inside the bucket. */
  path: string;
  /** File name only. */
  name: string;
  /** Folder path relative to the queried prefix ("" when at its root). */
  folder: string;
  kind: MediaKind;
  mimeType: string | null;
  size: number | null;
  updatedAt: string | null;
  /** Signed URL, valid for `SIGNED_URL_TTL` seconds. */
  url: string;
}

export interface MediaPage {
  items: MediaItem[];
  /** Offset to pass as `offset` for the next page, or null when exhausted. */
  nextOffset: number | null;
}

export interface ListMediaOptions {
  bucket: string;
  /** Folder prefix, without a trailing slash. */
  prefix: string;
  limit?: number;
  offset?: number;
  /** Case-insensitive filename filter applied to the fetched page. */
  search?: string;
  signed?: boolean;
}

export const MEDIA_PAGE_SIZE = 60;
export const SIGNED_URL_TTL = 60 * 60; // 1 hour

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "avif", "gif", "svg", "heic"];
const VIDEO_EXT = ["mp4", "webm", "mov", "m4v"];
const AUDIO_EXT = ["mp3", "wav", "m4a", "aac", "ogg"];

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

export function classifyMedia(name: string, mimeType?: string | null): MediaKind {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  if (mimeType?.startsWith("audio/")) return "audio";
  const ext = extensionOf(name);
  if (IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (AUDIO_EXT.includes(ext)) return "audio";
  return "other";
}

/**
 * Signs a batch of object paths in one request. Paths that fail to sign are
 * dropped rather than breaking the whole page.
 */
export async function signMedia(
  bucket: string,
  paths: string[],
  expiresIn: number = SIGNED_URL_TTL,
): Promise<Map<string, string>> {
  return signMediaWithClient(supabase, bucket, paths, expiresIn);
}

async function signMediaWithClient(
  client: MediaSupabaseClient,
  bucket: string,
  paths: string[],
  expiresIn: number,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;

  const { data, error } = await client.storage.from(bucket).createSignedUrls(paths, expiresIn);
  if (error) throw new ServiceError(error.message, error);

  for (const entry of data ?? []) {
    // `path` echoes the requested path; skip entries that errored.
    if (entry.signedUrl && entry.path) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

/** Lists a single page of media inside `prefix`, newest first. */
export async function listMedia({
  bucket,
  prefix,
  limit = MEDIA_PAGE_SIZE,
  offset = 0,
  search,
  signed = true,
}: ListMediaOptions): Promise<MediaPage> {
  const folder = prefix.replace(/^\/+|\/+$/g, "");

  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit,
    offset,
    search: search || undefined,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new ServiceError(error.message, error);

  const rows = data ?? [];
  // Folder rows and the `.emptyFolderPlaceholder` marker carry no metadata.
  const files = rows.filter((row) => !!row.id && row.name !== ".emptyFolderPlaceholder");

  const paths = files.map((row) => (folder ? `${folder}/${row.name}` : row.name));
  const urls = signed ? await signMedia(bucket, paths) : new Map<string, string>();

  const items: MediaItem[] = files.flatMap((row, i) => {
    const path = paths[i];
    const url = urls.get(path);
    if (signed && !url) return [];
    const meta = (row.metadata ?? {}) as { mimetype?: string; size?: number };
    return [
      {
        path,
        name: row.name,
        folder: "",
        kind: classifyMedia(row.name, meta.mimetype ?? null),
        mimeType: meta.mimetype ?? null,
        size: typeof meta.size === "number" ? meta.size : null,
        updatedAt: row.updated_at ?? row.created_at ?? null,
        url: url ?? "",
      },
    ];
  });

  // A short page means Storage has nothing left after this offset.
  const nextOffset = rows.length < limit ? null : offset + rows.length;
  return { items, nextOffset };
}

export interface ListMediaTreeOptions {
  bucket: string;
  /** Root folder prefix, without a trailing slash. */
  prefix: string;
  /** How deep to walk below `prefix`. */
  maxDepth?: number;
  /** Hard cap on returned files, protecting the UI from huge trees. */
  maxFiles?: number;
  signed?: boolean;
}

const TREE_LIST_LIMIT = 100;

/**
 * Walks `prefix` and all nested folders, returning every media file sorted
 * alphabetically by its full path. Filenames and extensions are discovered
 * from Storage — nothing is hardcoded.
 */
export async function listMediaTree(
  { bucket, prefix, maxDepth = 4, maxFiles = 500, signed = true }: ListMediaTreeOptions,
  client: MediaSupabaseClient = supabase,
): Promise<MediaItem[]> {
  const root = prefix.replace(/^\/+|\/+$/g, "");

  interface RawFile {
    path: string;
    name: string;
    folder: string;
    mimeType: string | null;
    size: number | null;
    updatedAt: string | null;
  }

  const files: RawFile[] = [];

  const walk = async (folder: string, depth: number): Promise<void> => {
    let offset = 0;
    const subfolders: string[] = [];

    // Page through the folder so folders with many objects are complete.
    for (;;) {
      const { data, error } = await client.storage.from(bucket).list(folder, {
        limit: TREE_LIST_LIMIT,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new ServiceError(error.message, error);
      const rows = data ?? [];

      for (const row of rows) {
        if (row.name === ".emptyFolderPlaceholder") continue;
        const path = folder ? `${folder}/${row.name}` : row.name;
        if (!row.id) {
          subfolders.push(path);
          continue;
        }
        if (files.length >= maxFiles) continue;
        const meta = (row.metadata ?? {}) as { mimetype?: string; size?: number };
        files.push({
          path,
          name: row.name,
          folder: path.slice(0, Math.max(0, path.length - row.name.length - 1)),
          mimeType: meta.mimetype ?? null,
          size: typeof meta.size === "number" ? meta.size : null,
          updatedAt: row.updated_at ?? row.created_at ?? null,
        });
      }

      if (rows.length < TREE_LIST_LIMIT) break;
      offset += rows.length;
    }

    if (depth >= maxDepth) return;
    for (const sub of subfolders) {
      if (files.length >= maxFiles) return;
      await walk(sub, depth + 1);
    }
  };

  await walk(root, 0);

  files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

  const urls = signed
    ? await signMediaWithClient(
        client,
        bucket,
        files.map((f) => f.path),
        SIGNED_URL_TTL,
      )
    : new Map<string, string>();

  return files.flatMap((f) => {
    const url = urls.get(f.path);
    if (signed && !url) return [];
    return [
      {
        path: f.path,
        name: f.name,
        // Folder relative to the queried root, for display purposes.
        folder:
          root && f.folder.startsWith(root)
            ? f.folder.slice(root.length).replace(/^\/+/, "")
            : f.folder,
        kind: classifyMedia(f.name, f.mimeType),
        mimeType: f.mimeType,
        size: f.size,
        updatedAt: f.updatedAt,
        url: url ?? "",
      } satisfies MediaItem,
    ];
  });
}

export const mediaService = {
  listMedia,
  listMediaTree,
  signMedia,
  classifyMedia,
  PAGE_SIZE: MEDIA_PAGE_SIZE,
  SIGNED_URL_TTL,
};
