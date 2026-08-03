/**
 * Central registry of the official production asset namespaces in Storage.
 *
 * Adding a character or a category here is a data change — no component or
 * service code needs to be touched, and no filename is ever hardcoded.
 */

/** The bucket holding official production assets. */
export const ASSETS_BUCKET = "exercise-assets";

export const CHARACTERS = ["shiran", "maya", "daniel", "ortal"] as const;
export type CharacterKey = (typeof CHARACTERS)[number];

export const CHARACTER_LABELS: Record<CharacterKey, string> = {
  shiran: "שירן",
  maya: "מאיה",
  daniel: "דניאל",
  ortal: "אורטל",
};

export const MEDIA_CATEGORIES = [
  "identity",
  "marketing",
  "exercise",
  "video",
] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<MediaCategory, string> = {
  identity: "זהות",
  marketing: "שיווק",
  exercise: "תרגילים",
  video: "וידאו",
};

export function isCharacter(value: string | undefined): value is CharacterKey {
  return !!value && (CHARACTERS as readonly string[]).includes(value);
}

export function isMediaCategory(value: string | undefined): value is MediaCategory {
  return !!value && (MEDIA_CATEGORIES as readonly string[]).includes(value);
}

/** `characters/<character>/<category>` — the canonical storage prefix. */
export function mediaPrefix(character: CharacterKey, category: MediaCategory): string {
  return `characters/${character}/${category}`;
}
