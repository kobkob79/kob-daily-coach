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
 * deeper scan would surface those objects here too. This was, before
 * 20260909120000_harden_exercise_assets_storage_rls.sql, the *only*
 * protection against an authenticated user reading a draft/rejected V2
 * video, since the bucket's Storage policy didn't gate by publish status
 * at all - that migration now closes the gap at the Storage-object layer
 * itself. `maxDepth: 0` stays regardless, as defense in depth (and because
 * it's simply the correct scope: canonical files are never written any
 * deeper than this) - but is no longer the sole barrier against a V2 leak.
 *
 * Prefix-failure handling (finding F11): the id folder (index 0 of
 * `exerciseMediaPrefixes()`) is authoritative, so if *its* listing fails,
 * this query must fail too (`isError`), never silently resolve as "the id
 * folder is empty" - which would let a stale slug-folder file win by
 * default. Only a slug-folder listing failure is safe to treat as an empty
 * group. See `combineExerciseMediaPrefixResults()` in exercise-media.ts.
 */
import { useQuery } from "@tanstack/react-query";
import { listMediaTree, SIGNED_URL_TTL } from "@/services/media.service";
import { ASSETS_BUCKET } from "@/lib/media-paths";
import {
  combineExerciseMediaPrefixResults,
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
      // flattened/merged into one array. Promise.allSettled (not
      // Promise.all + a blanket .catch) so a failed id-folder listing can
      // be told apart from a failed slug-folder listing - only the latter
      // is safe to swallow into an empty group (see
      // combineExerciseMediaPrefixResults()'s doc for why).
      const prefixes = exerciseMediaPrefixes(exerciseId, exerciseName);
      const settled = await Promise.allSettled(
        prefixes.map((prefix) =>
          listMediaTree({ bucket: ASSETS_BUCKET, prefix, maxDepth: 0, maxFiles: 60 }),
        ),
      );
      return combineExerciseMediaPrefixResults(settled);
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
