/**
 * Shared exercise metadata helpers (equipment, difficulty, secondary muscles).
 *
 * Purely derived from the existing `exercises` columns — no schema changes.
 * Used by the Exercise Picker and the Exercise Details sheet.
 */
import { normalizeMuscleGroup, type MuscleGroup } from "./muscle-groups.ts";

export type PickerExercise = {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  category: string | null;
  description: string | null;
  image_path?: string | null;
};

export type EquipmentKey =
  "machine" | "cable" | "barbell" | "dumbbell" | "bodyweight" | "smith" | "band" | "other";

export const EQUIPMENT_CHIPS: { key: EquipmentKey; label: string; emoji: string }[] = [
  { key: "bodyweight", label: "משקל גוף", emoji: "🧍" },
  { key: "dumbbell", label: "משקולות יד", emoji: "🏋" },
  { key: "barbell", label: "מוט", emoji: "➖" },
  { key: "machine", label: "מכונה", emoji: "⚙️" },
  { key: "cable", label: "כבלים", emoji: "🔗" },
  { key: "smith", label: "סמית'", emoji: "🏗" },
  { key: "band", label: "גומייה", emoji: "🎗" },
];

/** Maps free-text equipment values (Hebrew or English) to a filter key. */
export function equipmentKey(raw: string | null | undefined): EquipmentKey {
  const s = (raw ?? "").toLowerCase().trim();
  if (!s) return "bodyweight";
  if (/smith|סמית/.test(s)) return "smith";
  if (/band|גומי|רצוע/.test(s)) return "band";
  if (/cable|כבל|פולי/.test(s)) return "cable";
  if (/machine|מכונ/.test(s)) return "machine";
  if (/barbell|מוט/.test(s)) return "barbell";
  if (/dumbbell|משקולת|משקולות/.test(s)) return "dumbbell";
  if (/body|גוף|none|ללא/.test(s)) return "bodyweight";
  return "other";
}

export function equipmentLabel(raw: string | null | undefined): string {
  const key = equipmentKey(raw);
  const chip = EQUIPMENT_CHIPS.find((c) => c.key === key);
  return chip?.label ?? (raw?.trim() || "משקל גוף");
}

/** Difficulty is derived from equipment/category when the DB has no column. */
export function difficultyOf(ex: PickerExercise): { label: string; tone: string } {
  const key = equipmentKey(ex.equipment);
  if (key === "bodyweight" || key === "machine" || key === "band") {
    return { label: "מתחילים", tone: "bg-success/15 text-success" };
  }
  if (key === "barbell" || key === "smith") {
    return { label: "מתקדם", tone: "bg-destructive/15 text-destructive" };
  }
  return { label: "בינוני", tone: "bg-primary/15 text-primary" };
}

/** Secondary muscles inferred from the primary group (approximate, Hebrew). */
const SECONDARY: Record<MuscleGroup, string[]> = {
  חזה: ["יד אחורית", "כתפיים"],
  גב: ["יד קדמית", "שרירי ליבה"],
  רגליים: ["שרירי ליבה", "ישבן"],
  כתפיים: ["יד אחורית", "שרירי ליבה"],
  "יד קדמית": ["אמות", "כתפיים"],
  "יד אחורית": ["חזה", "כתפיים"],
  בטן: ["שרירי ליבה", "כופפי ירך"],
  "שרירי ליבה": ["בטן", "גב תחתון"],
  קרדיו: ["רגליים", "מערכת נשימה"],
  מוביליטי: ["שרירי ליבה", "גמישות מפרקים"],
  אחר: [],
};

export function secondaryMuscles(ex: PickerExercise): string[] {
  return SECONDARY[normalizeMuscleGroup(ex.muscle_group)] ?? [];
}

/** A concise "what this trains" line, falling back to a derived sentence. */
export function whatItTrains(ex: PickerExercise): string {
  const desc = ex.description?.trim();
  if (desc) return desc;
  const primary = normalizeMuscleGroup(ex.muscle_group);
  const sec = secondaryMuscles(ex);
  const secText = sec.length ? ` בעזרת ${sec.join(" ו")}` : "";
  return `תרגיל שמתמקד ב${primary}${secText}, בביצוע עם ${equipmentLabel(ex.equipment)}.`;
}

const FAV_KEY = "viora:exercise:favorites";

export function readFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAV_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeFavorites(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FAV_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable — favorites stay in-memory for this session */
  }
}
