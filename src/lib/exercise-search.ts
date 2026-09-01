/**
 * Shared, pure exercise search matching.
 *
 * The searchable haystack (name, Core 150 canonical/alias names, muscle
 * group, equipment) and the user's query are both run through the same
 * normalizer so Hebrew/English spelling variants (quotes, dashes,
 * whitespace, case) match consistently. No fuzzy/typo-tolerant matching.
 */
import { normalizeSearchText, normalizedSearchWords } from "./search-normalize.ts";
import { normalizeMuscleGroup } from "./muscle-groups.ts";
import { equipmentLabel, type PickerExercise } from "./exercise-meta.ts";
import { findCore150ExerciseByName } from "./core-150-exercises.ts";

/** Generic aliases retained for non-Core exercises. Core aliases come from the V2 canon. */
const GENERIC_ALIASES: { test: RegExp; words: string[] }[] = [
  { test: /לחיצת חזה|bench/i, words: ["bench press", "לחיצות", "חזה"] },
  { test: /סקוואט|squat/i, words: ["squat", "רגליים", "כפיפות"] },
  { test: /דדליפט|deadlift/i, words: ["deadlift", "גב", "הרמת מתים"] },
  { test: /מתח|pull.?up/i, words: ["pull up", "גב", "מתח"] },
  { test: /שכיב|push.?up/i, words: ["push up", "שכיבות סמיכה", "חזה"] },
  { test: /חתירה|row/i, words: ["row", "חתירה", "גב"] },
  { test: /כתף|press/i, words: ["shoulder press", "כתפיים"] },
  { test: /בייספס|biceps|כפיפ/i, words: ["biceps", "curl", "יד קדמית"] },
  { test: /טרייספס|triceps|פשיט/i, words: ["triceps", "יד אחורית"] },
  { test: /פלאנק|plank|בטן/i, words: ["plank", "core", "בטן"] },
];

/** Builds the normalized, searchable text for one exercise. */
export function buildExerciseSearchHaystack(ex: PickerExercise): string {
  const coreExercise = findCore150ExerciseByName(ex.name);
  const extra = GENERIC_ALIASES.filter((a) => a.test.test(ex.name)).flatMap((a) => a.words);
  const raw = [
    ex.name,
    coreExercise?.canonicalHebrewName ?? "",
    coreExercise?.englishName ?? "",
    ...(coreExercise?.aliases ?? []),
    ex.muscle_group ?? "",
    normalizeMuscleGroup(ex.muscle_group),
    ex.equipment ?? "",
    equipmentLabel(ex.equipment),
    ex.category ?? "",
    ...extra,
  ].join(" ");
  return normalizeSearchText(raw);
}

/** True when every word of the (normalized) query appears in the haystack. */
export function matchesExerciseQuery(haystack: string, query: string): boolean {
  const words = normalizedSearchWords(query);
  if (words.length === 0) return true;
  return words.every((word) => haystack.includes(word));
}
