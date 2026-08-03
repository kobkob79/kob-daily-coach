/**
 * useCharacterAssets — the single read path for character assets anywhere in
 * the app. Give it a characterId + assetCategory and it returns typed,
 * signed media items from Supabase Storage, including nested folders,
 * sorted alphabetically. Consuming screens never know the storage structure.
 */
import { useQuery } from "@tanstack/react-query";
import {
  listMediaTree,
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
  /** Case-insensitive filename/path filter, e.g. "hero". */
  search?: string;
  /** Restrict to one nested subfolder below the category, e.g. "closeups". */
  subfolder?: string;
  /** How deep to walk nested folders. */
  maxDepth?: number;
  enabled?: boolean;
}

export function characterAssetsQueryKey(
  characterId: CharacterId,
  category: AssetCategory,
  subfolder?: string,
) {
  return ["character-assets", characterId, category, subfolder ?? null] as const;
}

export function useCharacterAssets({
  characterId,
  category,
  search,
  subfolder,
  maxDepth = 4,
  enabled = true,
}: UseCharacterAssetsOptions) {
  const query = useQuery<MediaItem[]>({
    queryKey: characterAssetsQueryKey(characterId, category, subfolder),
    enabled,
    queryFn: () => {
      const base = characterAssetPrefix(characterId, category);
      return listMediaTree({
        bucket: ASSETS_BUCKET,
        prefix: subfolder ? `${base}/${subfolder}` : base,
        maxDepth,
      });
    },
    // Stay comfortably inside the signed-URL lifetime.
    staleTime: (SIGNED_URL_TTL - 300) * 1000,
    gcTime: SIGNED_URL_TTL * 1000,
    retry: 1,
  });

  const needle = search?.trim().toLowerCase();
  const items = needle
    ? (query.data ?? []).filter((i) => i.path.toLowerCase().includes(needle))
    : (query.data ?? []);

  return { ...query, items };
}
