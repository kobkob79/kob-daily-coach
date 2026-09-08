import test from "node:test";
import assert from "node:assert/strict";
import { suggestNextLoad } from "./next-load-suggestion.ts";

test("suggestNextLoad - null previous", () => {
  assert.equal(suggestNextLoad(null), null);
});

test("suggestNextLoad - missing weight or reps", () => {
  assert.equal(suggestNextLoad({ weightKg: null, reps: 10, rpe: 8 }), null);
  assert.equal(suggestNextLoad({ weightKg: 100, reps: null, rpe: 8 }), null);
  assert.equal(suggestNextLoad({ weightKg: null, reps: null, rpe: 8 }), null);
});

test("suggestNextLoad - missing RPE", () => {
  assert.deepEqual(suggestNextLoad({ weightKg: 100, reps: 5, rpe: null }), {
    weightKg: 100,
    reps: 5,
    reason: "בצע את אותו עומס כמו בפעם הקודמת",
  });
});

test("suggestNextLoad - RPE <= 7", () => {
  assert.deepEqual(suggestNextLoad({ weightKg: 100, reps: 5, rpe: 6 }), {
    weightKg: 102.5,
    reps: 5,
    reason: 'הרגיש קל בפעם הקודמת (RPE 6) — נסה להוסיף 2.5 ק"ג',
  });

  // Boundary value
  assert.deepEqual(suggestNextLoad({ weightKg: 100, reps: 5, rpe: 7 }), {
    weightKg: 102.5,
    reps: 5,
    reason: 'הרגיש קל בפעם הקודמת (RPE 7) — נסה להוסיף 2.5 ק"ג',
  });
});

test("suggestNextLoad - 7 < RPE < 9", () => {
  assert.deepEqual(suggestNextLoad({ weightKg: 100, reps: 5, rpe: 8 }), {
    weightKg: 100,
    reps: 5,
    reason: "מאמץ טוב בפעם הקודמת (RPE 8) — שמור על אותו עומס",
  });

  assert.deepEqual(suggestNextLoad({ weightKg: 100, reps: 5, rpe: 8.5 }), {
    weightKg: 100,
    reps: 5,
    reason: "מאמץ טוב בפעם הקודמת (RPE 8.5) — שמור על אותו עומס",
  });
});

test("suggestNextLoad - RPE >= 9", () => {
  // Boundary value
  assert.deepEqual(suggestNextLoad({ weightKg: 100, reps: 5, rpe: 9 }), {
    weightKg: 100,
    reps: 5,
    reason: "היה קרוב לכשל בפעם הקודמת (RPE 9) — שמור על אותו משקל, התמקד בטכניקה",
  });

  assert.deepEqual(suggestNextLoad({ weightKg: 100, reps: 5, rpe: 10 }), {
    weightKg: 100,
    reps: 5,
    reason: "היה קרוב לכשל בפעם הקודמת (RPE 10) — שמור על אותו משקל, התמקד בטכניקה",
  });
});
