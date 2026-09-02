import assert from "node:assert/strict";

import { normalizeSearchText, normalizedSearchWords } from "../src/lib/search-normalize.ts";
import { buildExerciseSearchHaystack, matchesExerciseQuery } from "../src/lib/exercise-search.ts";
import { fetchAllPages } from "../src/lib/paginate.ts";
import { getCore150ExerciseByNumber } from "../src/lib/core-150-exercises.ts";

// --- normalizeSearchText: lowercase, trim, whitespace, quotes, dashes ---

assert.equal(normalizeSearchText("  Hello   World  "), "hello world", "whitespace + case");
assert.equal(normalizeSearchText(null), "", "null-safe");
assert.equal(normalizeSearchText(undefined), "", "undefined-safe");
assert.equal(normalizeSearchText("ABC"), "abc", "uppercase English");
assert.equal(normalizeSearchText("סמית’"), "סמית'", "curly right quote -> straight apostrophe");
assert.equal(normalizeSearchText("סמית`"), "סמית'", "backtick -> straight apostrophe");
assert.equal(normalizeSearchText("סמית׳"), "סמית'", "Hebrew geresh -> straight apostrophe");
assert.equal(normalizeSearchText("T–Bar"), "t-bar", "en dash -> hyphen");
assert.equal(normalizeSearchText("T‑Bar"), "t-bar", "non-breaking hyphen -> hyphen");
assert.equal(normalizeSearchText("T—Bar"), "t-bar", "em dash -> hyphen");
assert.deepEqual(normalizedSearchWords("  Bench   Press "), ["bench", "press"], "word split");
assert.deepEqual(normalizedSearchWords(""), [], "empty query has no words");

// --- Hebrew canonical name / Hebrew legacy alias / English case ---

const core1 = getCore150ExerciseByNumber(1);
assert.ok(core1, "Core 150 exercise #1 must exist");
const legacyHebrewAlias = core1.aliases.find((alias) => /[֐-׿]/.test(alias));
assert.ok(legacyHebrewAlias, "exercise #1 must retain a Hebrew legacy alias");

const legacyRow = {
  id: "row-legacy-1",
  name: legacyHebrewAlias, // DB row still stores the old (legacy) Hebrew name
  muscle_group: "חזה",
  equipment: "מוט",
  category: null,
  description: null,
};
const legacyHay = buildExerciseSearchHaystack(legacyRow);

assert.equal(legacyRow.id, "row-legacy-1", "building the haystack must not mutate the exercise");
assert.equal(
  matchesExerciseQuery(legacyHay, core1.canonicalHebrewName),
  true,
  "Hebrew canonical name must find a row stored under its legacy alias",
);
assert.equal(
  matchesExerciseQuery(legacyHay, legacyHebrewAlias),
  true,
  "Hebrew legacy alias must still match the row that literally has that name",
);
assert.equal(
  matchesExerciseQuery(legacyHay, core1.englishName.toUpperCase()),
  true,
  "English uppercase query must match",
);
assert.equal(
  matchesExerciseQuery(legacyHay, core1.englishName.toLowerCase()),
  true,
  "English lowercase query must match",
);
assert.equal(
  matchesExerciseQuery(legacyHay, "no such exercise xyz"),
  false,
  "unrelated query must not match",
);

// --- multi-word query (order-independent, all words required) ---

const canonicalWords = normalizedSearchWords(core1.canonicalHebrewName);
assert.ok(canonicalWords.length >= 2, "canonical name should have multiple words for this test");
const multiWordQuery = [canonicalWords[canonicalWords.length - 1], canonicalWords[0]].join(" ");
assert.equal(
  matchesExerciseQuery(legacyHay, multiWordQuery),
  true,
  "multi-word query matches regardless of word order",
);

// --- quotes/hyphen variants against equipment label ("סמית'") ---

const smithRow = {
  id: "row-smith-1",
  name: "לחיצת כתפיים בסמית",
  muscle_group: "כתפיים",
  equipment: "smith",
  category: null,
  description: null,
};
const smithHay = buildExerciseSearchHaystack(smithRow);
assert.equal(
  matchesExerciseQuery(smithHay, "סמית’"),
  true,
  "curly quote query matches equipment label",
);
assert.equal(
  matchesExerciseQuery(smithHay, "סמית`"),
  true,
  "backtick query matches equipment label",
);

// --- muscle group (Hebrew canonical + raw English) ---

const backRow = {
  id: "row-back-1",
  name: "Unique Cable Row Exercise",
  muscle_group: "back",
  equipment: "cable",
  category: null,
  description: null,
};
const backHay = buildExerciseSearchHaystack(backRow);
assert.equal(matchesExerciseQuery(backHay, "גב"), true, "normalized Hebrew muscle group matches");
assert.equal(matchesExerciseQuery(backHay, "back"), true, "raw English muscle group value matches");

// --- equipment in Hebrew and English ---

assert.equal(matchesExerciseQuery(backHay, "כבלים"), true, "Hebrew equipment label matches");
assert.equal(matchesExerciseQuery(backHay, "cable"), true, "raw English equipment value matches");

// --- whitespace-heavy query ---

const whitespaceRow = {
  id: "row-ws-1",
  name: "  שכיבות   סמיכה  ",
  muscle_group: null,
  equipment: null,
  category: null,
  description: null,
};
const whitespaceHay = buildExerciseSearchHaystack(whitespaceRow);
assert.equal(
  matchesExerciseQuery(whitespaceHay, "   שכיבות     סמיכה   "),
  true,
  "irregular whitespace in query must not break matching",
);

// --- deterministic pagination across more than one page ---

const fixtureRows = Array.from({ length: 7 }, (_, i) => ({ id: `row-${i + 1}` }));
const calls = [];
async function fetchFixturePage({ from, to }) {
  calls.push({ from, to });
  return fixtureRows.slice(from, to + 1);
}
const allRows = await fetchAllPages(fetchFixturePage, 3);
assert.equal(allRows.length, 7, "all rows across pages must be returned");
assert.deepEqual(
  allRows.map((r) => r.id),
  fixtureRows.map((r) => r.id),
  "original IDs must be preserved, in order, across the paginated load",
);
assert.deepEqual(
  calls,
  [
    { from: 0, to: 2 },
    { from: 3, to: 5 },
    { from: 6, to: 8 },
  ],
  "pagination must walk deterministic, increasing ranges and stop once a page is short",
);

// Empty table: a single short (empty) page must stop the loop immediately.
const emptyCalls = [];
const emptyRows = await fetchAllPages(async (range) => {
  emptyCalls.push(range);
  return [];
}, 3);
assert.deepEqual(emptyRows, []);
assert.equal(emptyCalls.length, 1, "an empty first page must not trigger further requests");

await assert.rejects(
  fetchAllPages(async () => [], 0),
  /positive integer/,
  "pageSize must be validated",
);

console.log(
  "Exercise Search Normalization + Pagination: PASS (normalization, Core 150 aliases, muscle group, equipment, whitespace, multi-word query, and deterministic multi-page pagination all verified)",
);
