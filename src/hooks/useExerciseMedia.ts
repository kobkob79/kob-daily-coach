/**
 * useExerciseMedia — the single read path for exercise hero media.
 *
 * Walks every candidate Storage prefix for the exercise (id folder, then
 * name-slug folder) and keeps them as separate, priority-ordered groups -
 * the id folder is the canonical source of truth, the slug folder a
 * manual-upload convenience only used as a per-role fallback (see
 * `pickRoleMediaAcrossPrefixes()` in exercise-media.ts, VIORA-EXERCISE-
 * MEDIA-CROSS-SURFACE-SYNC-001 finding F2). Filenames are always
 * discovered from Storage, never hardcoded, so future uploads show up on
 * their own.
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
  pickRoleMediaAcrossPrefixes,
  resolveExerciseMediaAcrossPrefixes,
  type ExerciseHeroMedia,
  type ExerciseMediaPrefixGroups,
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
  const query = useQuery<ExerciseMediaPrefixGroups>({
    queryKey: exerciseMediaQueryKey(exerciseId, exerciseName),
    enabled: enabled && !!exerciseId,
    queryFn: async () => {
      // exerciseMediaPrefixes() already returns the id folder first, the
      // slug folder second - that order IS the priority order this hook
      // and the resolver rely on, so it is preserved verbatim rather than
      // flattened/merged into one array.
      const prefixes = exerciseMediaPrefixes(exerciseId, exerciseName);
      const pages = await Promise.all(
        prefixes.map((prefix) =>
          listMediaTree({ bucket: ASSETS_BUCKET, prefix, maxDepth: 0, maxFiles: 60 }).catch(
            () => [] as MediaItem[],
          ),
        ),
      );
      // Dedup only within each group (a paginated listing could in theory
      // repeat a path) - never across groups, since which group an item
      // came from is exactly the information the id-over-slug policy needs.
      return pages.map((page) => {
        const seen = new Set<string>();
        const group: MediaItem[] = [];
        for (const item of page) {
          if (seen.has(item.path)) continue;
          seen.add(item.path);
          group.push(item);
        }
        return group;
      });
    },
    staleTime: (SIGNED_URL_TTL - 300) * 1000,
    gcTime: SIGNED_URL_TTL * 1000,
    retry: 1,
  });

  const prefixGroups = query.data ?? [];
  // Flattened view for callers that just want "everything found," id-folder
  // items first - never used by role/slot resolution, which must stay
  // group-aware to preserve id-over-slug priority.
  const items = prefixGroups.flat();

  return {
    ...query,
    items,
    thumbnail: pickRoleMediaAcrossPrefixes(prefixGroups, "thumbnail"),
    main: pickRoleMediaAcrossPrefixes(prefixGroups, "main"),
    guide: pickRoleMediaAcrossPrefixes(prefixGroups, "guide"),
    demo: pickRoleMediaAcrossPrefixes(prefixGroups, "demo"),
    /**
     * Slot resolution with fallbacks - the single read path every surface
     * (active workout, exercise details, library card) must go through, so
     * they can never disagree. See resolveExerciseMediaAcrossPrefixes() for
     * the policy per slot.
     */
    resolve: (slot: ExerciseMediaSlot = "hero"): ExerciseHeroMedia | null =>
      resolveExerciseMediaAcrossPrefixes(prefixGroups, slot),
  };
}
