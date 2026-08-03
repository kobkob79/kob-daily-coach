/**
 * useExerciseMedia — the single read path for exercise hero media.
 *
 * Walks every candidate Storage prefix for the exercise (id folder, then
 * name-slug folder), merges the results and returns the best hero item by
 * role priority: video → animation → image. Filenames are always discovered
 * from Storage, never hardcoded, so future uploads show up on their own.
 */
import { useQuery } from "@tanstack/react-query";
import {
  listMediaTree,
  SIGNED_URL_TTL,
  type MediaItem,
} from "@/services/media.service";
import { ASSETS_BUCKET } from "@/lib/media-paths";
import {
  exerciseMediaPrefixes,
  pickHeroMedia,
  type ExerciseHeroMedia,
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
          listMediaTree({ bucket: ASSETS_BUCKET, prefix, maxDepth: 3, maxFiles: 60 }).catch(
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
  const hero: ExerciseHeroMedia | null = pickHeroMedia(items);

  return { ...query, items, hero };
}
