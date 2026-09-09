/**
 * Exercise media resolution.
 *
 * Exercise media lives in the same production bucket as character assets, under
 * `exercises/<slug-or-id>/…`. Nothing here hardcodes a filename: we list the
 * candidate folders from Storage and pick the best available item by role, so
 * newly uploaded videos/animations/images appear automatically.
 *
 * Priority: video → animation → hero image → placeholder.
 */
import type { MediaItem } from "@/services/media.service";

/** Root folder inside `ASSETS_BUCKET` holding per-exercise media. */
export const EXERCISE_MEDIA_ROOT = "exercises";

export type ExerciseMediaRole = "video" | "animation" | "image";

/** Folder-name hints used to classify animations. */
const ANIMATION_HINTS = ["anim", "animation", "animations", "loop", "gif"];
/** Filename hints that mark a still as the preferred hero frame. */
const HERO_HINTS = ["hero", "cover", "primary", "main"];

/** URL/Storage-safe slug for an exercise name (Hebrew kept as-is). */
export function exerciseSlug(name: string | null | undefined): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/["'׳״]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Candidate Storage prefixes for one exercise, most specific first.
 * The id-based folder is canonical; the slug folder is a convenience for
 * manual uploads made by name.
 */
export function exerciseMediaPrefixes(exerciseId: string, exerciseName?: string | null): string[] {
  const out = [`${EXERCISE_MEDIA_ROOT}/${exerciseId}`];
  const slug = exerciseSlug(exerciseName);
  if (slug) out.push(`${EXERCISE_MEDIA_ROOT}/${slug}`);
  return out;
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

/** Buckets a listed media item into a hero role. */
export function classifyExerciseMedia(item: MediaItem): ExerciseMediaRole {
  if (item.kind === "video") return "video";
  const ext = extensionOf(item.name);
  const haystack = `${item.folder}/${item.name}`.toLowerCase();
  if (ext === "gif" || ext === "apng") return "animation";
  if (ANIMATION_HINTS.some((h) => haystack.includes(h))) return "animation";
  return "image";
}

const ROLE_RANK: Record<ExerciseMediaRole, number> = {
  video: 0,
  animation: 1,
  image: 2,
};

export interface ExerciseHeroMedia {
  item: MediaItem;
  role: ExerciseMediaRole;
}

/**
 * Picks the single best hero item out of everything found for an exercise.
 * Within the same role, `hero`/`cover`/`primary` names win, then alphabetical
 * order (already applied by the media service) keeps the choice stable.
 */
export function pickHeroMedia(items: MediaItem[]): ExerciseHeroMedia | null {
  let best: ExerciseHeroMedia | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const item of items) {
    if (item.kind === "audio" || item.kind === "other") continue;
    const role = classifyExerciseMedia(item);
    const named = HERO_HINTS.some((h) => item.name.toLowerCase().includes(h));
    const score = ROLE_RANK[role] * 10 + (named ? 0 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = { item, role };
    }
  }
  return best;
}

/** Canonical assigned file names inside the exercise folder. */
export type ExerciseAssignedRole = "thumbnail" | "main" | "guide" | "demo";

const EXERCISE_ASSIGNED_ROLES: readonly ExerciseAssignedRole[] = [
  "thumbnail",
  "main",
  "guide",
  "demo",
];

/** Returns the explicit assigned role encoded by a canonical `<role>.<ext>` filename. */
export function getExerciseAssignedRole(
  item: Pick<MediaItem, "name">,
): ExerciseAssignedRole | null {
  const normalizedName = item.name.toLowerCase();
  return EXERCISE_ASSIGNED_ROLES.find((role) => normalizedName.startsWith(`${role}.`)) ?? null;
}

/**
 * Logical media slots requested by the UI.
 *
 * `active_workout` and `exercise_details` are the two canonical-only
 * surfaces fixed by VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001 (see
 * `resolveExerciseMedia()`); `thumbnail` is the library-card policy.
 */
export type ExerciseMediaSlot =
  "hero" | ExerciseAssignedRole | "active_workout" | "exercise_details";

/**
 * Picks the item to use when two or more files claim the same role (e.g. a
 * leftover `demo.mov` alongside a freshly assigned `demo.mp4`). The
 * assignment flow (`assignExerciseMediaServer`) is expected to keep at most
 * one file per role, but this is the deterministic tie-breaker if that
 * invariant is ever violated by stale/legacy data: the most recently
 * updated file wins, so a fresh replacement always displays even if an old
 * sibling failed to clean up.
 */
function pickMostRecentlyUpdated(items: MediaItem[]): MediaItem {
  return items.reduce((latest, item) => {
    const latestTime = latest.updatedAt ? Date.parse(latest.updatedAt) : Number.NEGATIVE_INFINITY;
    const itemTime = item.updatedAt ? Date.parse(item.updatedAt) : Number.NEGATIVE_INFINITY;
    return itemTime > latestTime ? item : latest;
  });
}

/**
 * Explicit canonical-role lookup (`thumbnail.*` / `main.*` / `guide.*` /
 * `demo.*`), written by the Media Inbox assignment flow. Returns null when the
 * exercise has no file for that role, so callers can fall back. When more
 * than one file exists for the same role, resolves deterministically to the
 * most recently updated one rather than an incidental array/sort order.
 */
export function pickRoleMedia(
  items: MediaItem[],
  role: ExerciseAssignedRole,
): ExerciseHeroMedia | null {
  const matches = items.filter((item) => getExerciseAssignedRole(item) === role);
  if (matches.length === 0) return null;
  const hit = matches.length === 1 ? matches[0] : pickMostRecentlyUpdated(matches);
  return { item: hit, role: classifyExerciseMedia(hit) };
}

/** Fallback chains per slot; anything unresolved ends at the hero priority. */
export const EXERCISE_SLOT_FALLBACKS: Record<ExerciseMediaSlot, ExerciseAssignedRole[]> = {
  hero: [],
  /**
   * Documents intended precedence only. Never walked by resolveExerciseMedia()
   * for the `thumbnail` slot - that goes through resolveExerciseThumbnailStill()
   * instead, which rejects video/animation outright rather than falling through
   * to the generic (video-first) hero priority. See VIORA-EXERCISE-THUMBNAIL-
   * STATIC-MEDIA-HOTFIX-001.
   */
  thumbnail: ["thumbnail", "main"],
  main: ["main"],
  guide: ["guide", "main"],
  demo: ["demo"],
  /**
   * Cross-surface consistency policy (VIORA-EXERCISE-MEDIA-CROSS-SURFACE-
   * SYNC-001): the active-workout hero and the exercise-details hero must
   * always agree, so a demo video assigned in the Media Inbox shows up in
   * both immediately. Deliberately does NOT fall through to the generic
   * (video-first, any-file) `pickHeroMedia()` - see resolveExerciseMedia().
   */
  active_workout: ["demo", "main", "thumbnail"],
  exercise_details: ["demo", "main", "thumbnail"],
};

/**
 * Static-only resolver for the Exercise Library card thumbnail.
 *
 * Unlike resolveExerciseMedia(), this never falls through to the generic
 * video-first pickHeroMedia(): a thumbnail must always be a still image (or
 * nothing), so an uploaded Motion Video never autoplays inside a library
 * card. Only explicit `thumbnail.*` / `main.*` candidates are considered,
 * and only when they classify as a plain image - video and animation/GIF
 * candidates are rejected for this surface even when explicitly assigned.
 */
export function resolveExerciseThumbnailStill(items: MediaItem[]): ExerciseHeroMedia | null {
  const thumbnail = pickRoleMedia(items, "thumbnail");
  if (thumbnail && thumbnail.role === "image") return thumbnail;

  const main = pickRoleMedia(items, "main");
  if (main && main.role === "image") return main;

  return null;
}

/**
 * Slots that resolve *only* through canonical, explicitly assigned roles
 * (`demo.*` / `main.*` / `thumbnail.*`) and never fall through to the
 * generic (video-first, any-file-in-the-folder) `pickHeroMedia()`. This is
 * the "only role קנוני ומאושר" guarantee from VIORA-EXERCISE-MEDIA-CROSS-
 * SURFACE-SYNC-001: it also keeps these two surfaces from ever picking up
 * an unrelated/incidental file (or, combined with `useExerciseMedia()`'s
 * root-only Storage scan, a V2 Motion Video draft) that happens to sit in
 * the exercise's folder without being assigned to a role.
 */
const CANONICAL_ONLY_SLOTS: readonly ExerciseMediaSlot[] = ["active_workout", "exercise_details"];

/** Resolves a slot with its fallback chain, then the generic hero priority. */
export function resolveExerciseMedia(
  items: MediaItem[],
  slot: ExerciseMediaSlot = "hero",
): ExerciseHeroMedia | null {
  if (slot === "thumbnail") return resolveExerciseThumbnailStill(items);

  for (const role of EXERCISE_SLOT_FALLBACKS[slot]) {
    const hit = pickRoleMedia(items, role);
    if (hit) return hit;
  }
  if (CANONICAL_ONLY_SLOTS.includes(slot)) return null;
  return pickHeroMedia(items);
}

/**
 * Ordered groups of items from one exercise's candidate Storage prefixes,
 * most authoritative first. `useExerciseMedia()` builds this from
 * `exerciseMediaPrefixes()`: the exercise-id folder (index 0, always
 * canonical) then the name-slug folder (index 1, a manual-upload
 * convenience only).
 */
export type ExerciseMediaPrefixGroups = MediaItem[][];

/**
 * Per-role lookup across ordered prefix groups (VIORA-EXERCISE-MEDIA-
 * CROSS-SURFACE-SYNC-001 finding F2): the exercise-id folder is the source
 * of truth. If a role exists there, the *same* role from the name-slug
 * folder can never win, no matter how recently the slug-folder copy was
 * updated - `updatedAt` (via `pickRoleMedia`'s own dedup) only ever breaks
 * ties between duplicates *within* one folder. The slug folder is
 * consulted at all only when the id folder has no file for that role.
 */
export function pickRoleMediaAcrossPrefixes(
  prefixGroups: ExerciseMediaPrefixGroups,
  role: ExerciseAssignedRole,
): ExerciseHeroMedia | null {
  for (const group of prefixGroups) {
    const hit = pickRoleMedia(group, role);
    if (hit) return hit;
  }
  return null;
}

/** Prefix-group-aware counterpart to `resolveExerciseThumbnailStill()` - see `pickRoleMediaAcrossPrefixes()`. */
export function resolveExerciseThumbnailStillAcrossPrefixes(
  prefixGroups: ExerciseMediaPrefixGroups,
): ExerciseHeroMedia | null {
  const thumbnail = pickRoleMediaAcrossPrefixes(prefixGroups, "thumbnail");
  if (thumbnail && thumbnail.role === "image") return thumbnail;

  const main = pickRoleMediaAcrossPrefixes(prefixGroups, "main");
  if (main && main.role === "image") return main;

  return null;
}

/**
 * Prefix-group-aware counterpart to `resolveExerciseMedia()` - the
 * function every UI surface should call once media is grouped by Storage
 * prefix (see `useExerciseMedia()`). Same slot policy, but every role
 * lookup along the way goes through `pickRoleMediaAcrossPrefixes()` so the
 * id folder always outranks the slug folder for a given role, and only the
 * final generic-hero fallback (non-canonical-only slots) considers a
 * lower-priority group at all - and even then, only after the
 * higher-priority group's own generic pick comes up empty.
 */
export function resolveExerciseMediaAcrossPrefixes(
  prefixGroups: ExerciseMediaPrefixGroups,
  slot: ExerciseMediaSlot = "hero",
): ExerciseHeroMedia | null {
  if (slot === "thumbnail") return resolveExerciseThumbnailStillAcrossPrefixes(prefixGroups);

  for (const role of EXERCISE_SLOT_FALLBACKS[slot]) {
    const hit = pickRoleMediaAcrossPrefixes(prefixGroups, role);
    if (hit) return hit;
  }
  if (CANONICAL_ONLY_SLOTS.includes(slot)) return null;

  for (const group of prefixGroups) {
    const hit = pickHeroMedia(group);
    if (hit) return hit;
  }
  return null;
}

export const EXERCISE_MEDIA_ROLE_LABEL: Record<ExerciseMediaRole, string> = {
  video: "וידאו",
  animation: "אנימציה",
  image: "תמונה",
};
