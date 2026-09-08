/**
 * Run with: node --test src/lib/next-load-suggestion.test.ts
 *
 * AI-005 rule-based load recommendation
 * (AI-005-CODEX-SAFETY-REVIEW-FIX-001): reps-first progression (no fixed
 * weight jump — equipment increments vary too much to guess), fail-closed
 * input validation, warm-up/incomplete-set exclusion, and the accessible
 * label content.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSuggestionAriaLabel,
  buildSuggestionMap,
  suggestNextLoad,
  type HistoricalSetForSuggestion,
} from "./next-load-suggestion.ts";

test("null previous → no suggestion", () => {
  assert.equal(suggestNextLoad(null), null);
});

test("missing weight or reps → no suggestion", () => {
  assert.equal(suggestNextLoad({ weightKg: null, reps: 10, rpe: 8 }), null);
  assert.equal(suggestNextLoad({ weightKg: 100, reps: null, rpe: 8 }), null);
  assert.equal(suggestNextLoad({ weightKg: null, reps: null, rpe: 8 }), null);
});

test("missing RPE → repeat the same weight and reps (not null)", () => {
  assert.deepEqual(suggestNextLoad({ weightKg: 100, reps: 5, rpe: null }), {
    weightKg: 100,
    reps: 5,
    reason: "בצע את אותו עומס כמו בפעם הקודמת",
  });
});

test("2.5 kg at low RPE does not become 5 kg — weight never auto-increases", () => {
  const result = suggestNextLoad({ weightKg: 2.5, reps: 8, rpe: 6 });
  assert.ok(result);
  assert.equal(result!.weightKg, 2.5);
  assert.equal(result!.reps, 9);
});

test("8 kg at low RPE keeps 8 kg and adds one repetition", () => {
  const result = suggestNextLoad({ weightKg: 8, reps: 5, rpe: 6 });
  assert.deepEqual(result, {
    weightKg: 8,
    reps: 6,
    reason: "הרגיש קל בפעם הקודמת (RPE 6) — נסה חזרה נוספת באותו משקל",
  });
});

test("RPE boundary: exactly 7 → still counted as low, +1 rep, same weight", () => {
  const result = suggestNextLoad({ weightKg: 60, reps: 8, rpe: 7 });
  assert.deepEqual(result, {
    weightKg: 60,
    reps: 9,
    reason: "הרגיש קל בפעם הקודמת (RPE 7) — נסה חזרה נוספת באותו משקל",
  });
});

test("RPE boundary: exactly 8 → maintain, same weight and reps", () => {
  const result = suggestNextLoad({ weightKg: 60, reps: 8, rpe: 8 });
  assert.deepEqual(result, {
    weightKg: 60,
    reps: 8,
    reason: "מאמץ טוב בפעם הקודמת (RPE 8) — שמור על אותו עומס",
  });
});

test("RPE boundary: exactly 9 → near-failure, -1 rep, same weight", () => {
  const result = suggestNextLoad({ weightKg: 60, reps: 8, rpe: 9 });
  assert.deepEqual(result, {
    weightKg: 60,
    reps: 7,
    reason: "היה קרוב לכשל בפעם הקודמת (RPE 9) — הפחת חזרה אחת ושמור על טכניקה",
  });
});

test("RPE boundary: exactly 10 → near-failure, -1 rep, same weight", () => {
  const result = suggestNextLoad({ weightKg: 60, reps: 8, rpe: 10 });
  assert.deepEqual(result, {
    weightKg: 60,
    reps: 7,
    reason: "היה קרוב לכשל בפעם הקודמת (RPE 10) — הפחת חזרה אחת ושמור על טכניקה",
  });
});

test("high RPE (>= 9) never increases load or reps, for a range of RPE values", () => {
  for (const rpe of [9, 9.5, 10]) {
    const result = suggestNextLoad({ weightKg: 60, reps: 8, rpe });
    assert.ok(result);
    assert.equal(result!.weightKg, 60);
    assert.ok(result!.reps <= 8, `reps must not increase at RPE ${rpe}`);
  }
});

test("rep reduction never goes below 1", () => {
  const result = suggestNextLoad({ weightKg: 40, reps: 1, rpe: 9.5 });
  assert.deepEqual(result, {
    weightKg: 40,
    reps: 1,
    reason: "היה קרוב לכשל בפעם הקודמת (RPE 9.5) — שמור על אותו עומס וחזרות, התמקד בטכניקה",
  });
});

test("invalid weight is rejected: NaN, Infinity, negative", () => {
  assert.equal(suggestNextLoad({ weightKg: NaN, reps: 5, rpe: 6 }), null);
  assert.equal(suggestNextLoad({ weightKg: Infinity, reps: 5, rpe: 6 }), null);
  assert.equal(suggestNextLoad({ weightKg: -5, reps: 5, rpe: 6 }), null);
});

test("invalid reps are rejected: fractional, zero, negative, NaN, Infinity", () => {
  assert.equal(suggestNextLoad({ weightKg: 50, reps: 8.5, rpe: 6 }), null);
  assert.equal(suggestNextLoad({ weightKg: 50, reps: 0, rpe: 6 }), null);
  assert.equal(suggestNextLoad({ weightKg: 50, reps: -3, rpe: 6 }), null);
  assert.equal(suggestNextLoad({ weightKg: 50, reps: NaN, rpe: 6 }), null);
  assert.equal(suggestNextLoad({ weightKg: 50, reps: Infinity, rpe: 6 }), null);
});

test("invalid RPE is rejected: 0, 11, NaN, Infinity", () => {
  assert.equal(suggestNextLoad({ weightKg: 50, reps: 8, rpe: 0 }), null);
  assert.equal(suggestNextLoad({ weightKg: 50, reps: 8, rpe: 11 }), null);
  assert.equal(suggestNextLoad({ weightKg: 50, reps: 8, rpe: NaN }), null);
  assert.equal(suggestNextLoad({ weightKg: 50, reps: 8, rpe: Infinity }), null);
});

test("valid RPE range boundaries 1 and 10 are accepted, not rejected", () => {
  assert.notEqual(suggestNextLoad({ weightKg: 50, reps: 8, rpe: 1 }), null);
  assert.notEqual(suggestNextLoad({ weightKg: 50, reps: 8, rpe: 10 }), null);
});

function set(overrides: Partial<HistoricalSetForSuggestion>): HistoricalSetForSuggestion {
  return {
    set_number: 1,
    weight_kg: 50,
    reps: 8,
    rpe: 6,
    completed_at: "2026-09-01T10:00:00.000Z",
    is_warmup: false,
    ...overrides,
  };
}

test("buildSuggestionMap: warm-up sets still receive no recommendation", () => {
  const map = buildSuggestionMap([set({ set_number: 1, is_warmup: true })]);
  assert.equal(map.has(1), false);
});

test("buildSuggestionMap: only completed historical sets seed a recommendation", () => {
  const map = buildSuggestionMap([
    set({ set_number: 1, completed_at: null }),
    set({ set_number: 2, completed_at: "2026-09-01T10:00:00.000Z" }),
  ]);
  assert.equal(map.has(1), false);
  assert.equal(map.has(2), true);
});

test("buildSuggestionMap: keys by set_number, skips rows with no valid suggestion", () => {
  const map = buildSuggestionMap([
    set({ set_number: 1, weight_kg: null }),
    set({ set_number: 2, weight_kg: 60, reps: 5, rpe: 6 }),
  ]);
  assert.equal(map.has(1), false);
  assert.deepEqual(map.get(2), {
    weightKg: 60,
    reps: 6,
    reason: "הרגיש קל בפעם הקודמת (RPE 6) — נסה חזרה נוספת באותו משקל",
  });
});

test("buildSuggestionAriaLabel exposes weight, reps and the reason in one accessible sentence", () => {
  const label = buildSuggestionAriaLabel({ weightKg: 62.5, reps: 8, reason: "בדיקה" });
  assert.match(label, /62\.5/);
  assert.match(label, /8/);
  assert.match(label, /בדיקה/);
});
