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

export type ExerciseMediaAssignmentRole =
  | "thumbnail"
  | "main"
  | "guide"
  | "demo";

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
export function exerciseMediaPrefixes(
  exerciseId: string,
  exerciseName?: string | null,
): string[] {
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

export function pickAssignedExerciseMedia(
  items: MediaItem[],
  role: ExerciseMediaAssignmentRole,
): MediaItem | null {
  const prefix = `${role}.`;

  return items.find((item) =>
    item.name.toLowerCase().startsWith(prefix),
  ) ?? null;
}

export const EXERCISE_MEDIA_ROLE_LABEL: Record<ExerciseMediaRole, string> = {
  video: "וידאו",
  animation: "אנימציה",
  image: "תמונה",
};
