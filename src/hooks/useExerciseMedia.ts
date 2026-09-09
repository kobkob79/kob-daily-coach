/**
 * useExerciseMedia — the single read path for exercise hero media.
 *
 * Walks every candidate Storage prefix for the exercise (id folder, then
 * name-slug folder), merges the results and returns the best hero item by
 * role priority: video → animation → image. Filenames are always discovered
 * from Storage, never hardcoded, so future uploads show up on their own.
 *
 * Root-level only (`maxDepth: 0`): the assignment flow always writes
 * canonical `<role>.<ext>` files directly under `exercises/<id>/`, and the
 * V2 Motion Video pipeline stores its own drafts one level down, under
 * `exercises/<id>/v2/<mediaVersionId>/...` (see exercise-media-v2.ts). A
 * deeper scan would surface those objects here too - including a
 * draft/rejected/unpublished V2 video, which the Storage bucket's read
 * policy does not itself gate by publish status (only the
 * `exercise_media_versions`/`exercise_media_assets` *table* RLS does).
 * Never widen this without a Storage-level fix for that first - see
 * VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001.
 */
import { useQuery } from "@tanstack/react-query";
import { listMediaTree, SIGNED_URL_TTL, type MediaItem } from "@/services/media.service";
import { ASSETS_BUCKET } from "@/lib/media-paths";
import {
  exerciseMediaPrefixes,
  pickRoleMedia,
  resolveExerciseMedia,
  type ExerciseHeroMedia,
  type ExerciseMediaSlot,
} from "@/lib/exercise-media";

export function exerciseMediaQueryKey(exerciseId: string, slugSource?: string | null) {
  return ["exercise-media", exerciseId, slugSource ?? null] as const;
}

export interface UseExerciseMediaOptions {
  exerciseId: string;
  /** Exercise name, used only to derive the alternate slug folder. */
  exerciseName?: string | null;
  enabled?: boolean;
}

export function useExerciseMedia({
  exerciseId,
  exerciseName,
  enabled = true,
}: UseExerciseMediaOptions) {
  const query = useQuery<MediaItem[]>({
    queryKey: exerciseMediaQueryKey(exerciseId, exerciseName),
    enabled: enabled && !!exerciseId,
    queryFn: async () => {
      const prefixes = exerciseMediaPrefixes(exerciseId, exerciseName);
      const pages = await Promise.all(
        prefixes.map((prefix) =>
          listMediaTree({ bucket: ASSETS_BUCKET, prefix, maxDepth: 0, maxFiles: 60 }).catch(
            () => [] as MediaItem[],
          ),
        ),
      );
      const seen = new Set<string>();
      const merged: MediaItem[] = [];
      for (const page of pages) {
        for (const item of page) {
          if (seen.has(item.path)) continue;
          seen.add(item.path);
          merged.push(item);
        }
      }
      return merged;
    },
    staleTime: (SIGNED_URL_TTL - 300) * 1000,
    gcTime: SIGNED_URL_TTL * 1000,
    retry: 1,
  });

  const items = query.data ?? [];

  return {
    ...query,
    items,
    thumbnail: pickRoleMedia(items, "thumbnail"),
    main: pickRoleMedia(items, "main"),
    guide: pickRoleMedia(items, "guide"),
    demo: pickRoleMedia(items, "demo"),
    /**
     * Slot resolution with fallbacks - the single read path every surface
     * (active workout, exercise details, library card) must go through, so
     * they can never disagree. See resolveExerciseMedia() for the policy
     * per slot.
     */
    resolve: (slot: ExerciseMediaSlot = "hero"): ExerciseHeroMedia | null =>
      resolveExerciseMedia(items, slot),
  };
}
