/**
 * AI-005 — next-session load recommendation, rule-based v1 (no LLM).
 *
 * Pure module: no Supabase/React imports, so it's trivially unit-testable
 * and safe to import from client code. Every input is validated — a
 * corrupt or out-of-range value (NaN, Infinity, a negative weight, a
 * fractional/zero/negative rep count, an RPE outside 1–10) fails closed to
 * `null` rather than producing a misleading suggestion. This is
 * suggestion-only: nothing here writes to a set.
 */

export interface PreviousSetForSuggestion {
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface LoadSuggestion {
  weightKg: number;
  reps: number;
  reason: string; // Hebrew, short, specific — no generic hype
}

function isValidWeight(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isValidReps(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function isValidRpe(value: number): boolean {
  return Number.isFinite(value) && value >= 1 && value <= 10;
}

/**
 * Reps-first policy — the weight never moves automatically (equipment
 * increments vary too much — 2.5 kg on a barbell is a very different jump
 * than 2.5 kg on a dumbbell or cable stack — so progression is expressed
 * through one extra/fewer repetition at the same weight instead).
 */
export function suggestNextLoad(previous: PreviousSetForSuggestion | null): LoadSuggestion | null {
  if (previous === null) return null;
  if (previous.weightKg === null || !isValidWeight(previous.weightKg)) return null;
  if (previous.reps === null || !isValidReps(previous.reps)) return null;

  const weightKg = previous.weightKg;
  const reps = previous.reps;

  if (previous.rpe === null) {
    return { weightKg, reps, reason: "בצע את אותו עומס כמו בפעם הקודמת" };
  }
  if (!isValidRpe(previous.rpe)) return null;
  const rpe = previous.rpe;

  if (rpe <= 7) {
    return {
      weightKg,
      reps: reps + 1,
      reason: `הרגיש קל בפעם הקודמת (RPE ${rpe}) — נסה חזרה נוספת באותו משקל`,
    };
  }

  if (rpe < 9) {
    return { weightKg, reps, reason: `מאמץ טוב בפעם הקודמת (RPE ${rpe}) — שמור על אותו עומס` };
  }

  // rpe >= 9
  const nextReps = Math.max(1, reps - 1);
  const reason =
    nextReps < reps
      ? `היה קרוב לכשל בפעם הקודמת (RPE ${rpe}) — הפחת חזרה אחת ושמור על טכניקה`
      : `היה קרוב לכשל בפעם הקודמת (RPE ${rpe}) — שמור על אותו עומס וחזרות, התמקד בטכניקה`;
  return { weightKg, reps: nextReps, reason };
}

/** Minimal shape needed from a historical set row — decoupled from the full SessionSet type. */
export interface HistoricalSetForSuggestion {
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  completed_at: string | null;
  is_warmup: boolean;
}

/**
 * Builds the per-set-number suggestion map for an exercise screen from a
 * prior session's sets. Only a genuinely completed, non-warm-up historical
 * set is eligible to seed a recommendation — an incomplete or warm-up row
 * is skipped, matching the WORKOUT-010 convention of excluding warm-ups
 * from anything that resembles a working-set record.
 */
export function buildSuggestionMap(
  sets: HistoricalSetForSuggestion[],
): Map<number, LoadSuggestion> {
  const map = new Map<number, LoadSuggestion>();
  for (const s of sets) {
    if (!s.completed_at || s.is_warmup) continue;
    const suggestion = suggestNextLoad({ weightKg: s.weight_kg, reps: s.reps, rpe: s.rpe });
    if (suggestion) map.set(s.set_number, suggestion);
  }
  return map;
}

/**
 * Full Hebrew accessible description for a suggestion — weight, reps and
 * the reason — meant for an `aria-label`, not for the always-visible line
 * (which stays short). Keeping this as its own pure function makes the
 * accessible text unit-testable without a DOM/component-render harness.
 */
export function buildSuggestionAriaLabel(suggestion: LoadSuggestion): string {
  return `המלצה להיום: ${suggestion.weightKg} קילוגרם, ${suggestion.reps} חזרות. ${suggestion.reason}`;
}
