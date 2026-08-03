/**
 * useCharacterAssets — the single read path for character assets anywhere in
 * the app. Give it a characterId + assetCategory and it returns typed,
 * signed media items from Supabase Storage.
 *
 * Any screen (home, workouts, marketing surfaces, onboarding…) can call this
 * hook; the QA gallery is just one more consumer.
 */
import { useQuery } from "@tanstack/react-query";
import {
  listMedia,
  MEDIA_PAGE_SIZE,
  SIGNED_URL_TTL,
  type MediaItem,
} from "@/services/media.service";
import {
  ASSETS_BUCKET,
  characterAssetPrefix,
  type AssetCategory,
  type CharacterId,
} from "@/lib/media-paths";

export interface UseCharacterAssetsOptions {
  characterId: CharacterId;
  category: AssetCategory;
  /** Case-insensitive filename filter, e.g. "hero". */
  search?: string;
  /** How many objects to fetch (single page). */
  limit?: number;
  enabled?: boolean;
}

export function characterAssetsQueryKey(
  characterId: CharacterId,
  category: AssetCategory,
  search?: string,
) {
  return ["character-assets", characterId, category, search ?? null] as const;
}

export function useCharacterAssets({
  characterId,
  category,
  search,
  limit = MEDIA_PAGE_SIZE,
  enabled = true,
}: UseCharacterAssetsOptions) {
  return useQuery<MediaItem[]>({
    queryKey: characterAssetsQueryKey(characterId, category, search),
    enabled,
    queryFn: async () => {
      const page = await listMedia({
        bucket: ASSETS_BUCKET,
        prefix: characterAssetPrefix(characterId, category),
        limit,
        search,
      });
      return page.items;
    },
    // Stay comfortably inside the signed-URL lifetime.
    staleTime: (SIGNED_URL_TTL - 300) * 1000,
    gcTime: SIGNED_URL_TTL * 1000,
    retry: 1,
  });
}
