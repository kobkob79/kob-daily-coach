/**
 * Meals domain — Hebrew-first constants, mapping to legacy DB enum, and
 * lightweight helpers. Kept UI-agnostic so future surfaces (AI photo
 * analysis, barcode scanning, recipe recognition) can share it.
 */
import type { Database } from "@/integrations/supabase/types";

export type MealTypeKey =
  | "breakfast"
  | "midmeal"
  | "lunch"
  | "dinner"
  | "night"
  | "other";

export interface MealTypeDef {
  key: MealTypeKey;
  label: string;   // Hebrew label shown in UI + persisted to meal_type text
  emoji: string;
  enum: Database["public"]["Enums"]["meal_type"]; // maps to legacy enum column
}

export const MEAL_TYPES: MealTypeDef[] = [
  { key: "breakfast", label: "ארוחת בוקר",   emoji: "🌅", enum: "breakfast" },
  { key: "midmeal",   label: "ארוחת ביניים", emoji: "🥪", enum: "snack" },
  { key: "lunch",     label: "ארוחת צהריים", emoji: "🍽️", enum: "lunch" },
  { key: "dinner",    label: "ארוחת ערב",    emoji: "🌆", enum: "dinner" },
  { key: "night",     label: "ארוחת לילה",   emoji: "🌙", enum: "snack" },
  { key: "other",     label: "אחר",          emoji: "✨", enum: "snack" },
];

export const MEAL_TYPE_BY_LABEL = Object.fromEntries(
  MEAL_TYPES.map((m) => [m.label, m]),
) as Record<string, MealTypeDef>;

export function suggestMealType(date = new Date()): MealTypeDef {
  const h = date.getHours();
  if (h >= 5 && h < 10) return MEAL_TYPES[0];
  if (h >= 10 && h < 12) return MEAL_TYPES[1];
  if (h >= 12 && h < 16) return MEAL_TYPES[2];
  if (h >= 16 && h < 21) return MEAL_TYPES[3];
  return MEAL_TYPES[4];
}

export interface LocationDef {
  key: string;
  label: string;
  emoji: string;
}

export const LOCATIONS: LocationDef[] = [
  { key: "home",       label: "בית",      emoji: "🏠" },
  { key: "intel",      label: "אינטל",    emoji: "🏢" },
  { key: "restaurant", label: "מסעדה",    emoji: "🍴" },
  { key: "outside",    label: "בחוץ",     emoji: "🌳" },
  { key: "other",      label: "אחר",      emoji: "📍" },
];

/**
 * A food item inside a meal. Nutrition fields are optional so photo-based
 * or barcode-based flows can add them later.
 */
export interface FoodItem {
  name: string;
  qty?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
}

/** Compute the "biological day" — meals between 00:00-04:59 still count
 *  as the previous day so night-shift users see a coherent timeline. */
export function biologicalDay(date: Date): string {
  const d = new Date(date);
  if (d.getHours() < 5) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Seed favorites — inserted on first use when the user has none. */
export interface SeedFavorite {
  name: string;
  emoji: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  default_meal_type?: string;
}

export const SEED_FAVORITES: SeedFavorite[] = [
  { name: "קוטג'",        emoji: "🥣", calories: 180, protein_g: 22, carbs_g: 8,  fat_g: 6, default_meal_type: "ארוחת בוקר" },
  { name: "טונה",         emoji: "🐟", calories: 120, protein_g: 26, carbs_g: 0,  fat_g: 1, default_meal_type: "ארוחת צהריים" },
  { name: "ביצה",         emoji: "🥚", calories: 78,  protein_g: 6,  carbs_g: 0,  fat_g: 5, default_meal_type: "ארוחת בוקר" },
  { name: "חטיף חלבון",   emoji: "🍫", calories: 210, protein_g: 20, carbs_g: 18, fat_g: 7, default_meal_type: "ארוחת ביניים" },
  { name: "קפה חלבון",    emoji: "☕", calories: 150, protein_g: 20, carbs_g: 6,  fat_g: 3, default_meal_type: "ארוחת ביניים" },
  { name: "קפה",          emoji: "☕", calories: 5,   protein_g: 0,  carbs_g: 1,  fat_g: 0, default_meal_type: "ארוחת בוקר" },
  { name: "מים",          emoji: "💧", calories: 0,   protein_g: 0,  carbs_g: 0,  fat_g: 0, default_meal_type: "אחר" },
];
