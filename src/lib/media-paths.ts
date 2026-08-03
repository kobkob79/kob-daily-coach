/**
 * Central registry of the character asset namespaces in Storage.
 *
 * Adding a character or a category here is a data change — no component or
 * service code needs to be touched, and no filename is ever hardcoded.
 * Screens consume assets through `useCharacterAssets` / `<CharacterAsset />`.
 */

/** The bucket holding official production assets. */
export const ASSETS_BUCKET = "exercise-assets";

export const CHARACTER_IDS = ["shiran", "maya", "daniel", "ortal"] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTER_LABELS: Record<CharacterId, string> = {
  shiran: "שירן",
  maya: "מאיה",
  daniel: "דניאל",
  ortal: "אורטל",
};

/**
 * Which characters already have uploaded assets. Purely informational — the
 * media layer never branches on it, the QA page just flags empty datasets.
 */
export const POPULATED_CHARACTERS: readonly CharacterId[] = ["shiran"];

export const ASSET_CATEGORIES = [
  "identity",
  "marketing",
  "exercise",
  "video",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<AssetCategory, string> = {
  identity: "זהות",
  marketing: "שיווק",
  exercise: "תרגילים",
  video: "וידאו",
};

export function isCharacterId(value: string | undefined): value is CharacterId {
  return !!value && (CHARACTER_IDS as readonly string[]).includes(value);
}

export function isAssetCategory(value: string | undefined): value is AssetCategory {
  return !!value && (ASSET_CATEGORIES as readonly string[]).includes(value);
}

/** `characters/<characterId>/<category>` — the canonical storage prefix. */
export function characterAssetPrefix(
  characterId: CharacterId,
  category: AssetCategory,
): string {
  return `characters/${characterId}/${category}`;
}

/* Legacy aliases kept so older imports keep compiling. */
export const CHARACTERS = CHARACTER_IDS;
export const MEDIA_CATEGORIES = ASSET_CATEGORIES;
export type CharacterKey = CharacterId;
export type MediaCategory = AssetCategory;
export const isCharacter = isCharacterId;
export const isMediaCategory = isAssetCategory;
export const mediaPrefix = characterAssetPrefix;
