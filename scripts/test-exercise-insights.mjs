import assert from "node:assert/strict";

import {
  EXERCISE_INSIGHT_MAX_LENGTH,
  addExerciseInsight,
  deleteExerciseInsight,
  editExerciseInsight,
  validateExerciseInsightText,
} from "../src/lib/exercise-insights.ts";

assert.deepEqual(validateExerciseInsightText("  גובה כיסא: 4  "), {
  valid: true,
  value: "גובה כיסא: 4",
});
assert.equal(validateExerciseInsightText("   ").valid, false, "whitespace-only text is rejected");
assert.equal(
  validateExerciseInsightText("א".repeat(EXERCISE_INSIGHT_MAX_LENGTH)).valid,
  true,
  "the character limit is accepted",
);
assert.equal(
  validateExerciseInsightText("א".repeat(EXERCISE_INSIGHT_MAX_LENGTH + 1)).valid,
  false,
  "text beyond the character limit is rejected",
);

const first = { id: "insight-1", category: "machine_setup", text: "גובה כיסא: 4" };
const second = { id: "insight-2", category: "technique", text: "לשמור על צוואר ישר" };

const afterAdd = addExerciseInsight([], first);
assert.deepEqual(afterAdd, [first], "add appends an insight");
assert.throws(
  () => addExerciseInsight(afterAdd, first),
  /already exists/,
  "duplicate IDs fail loudly",
);

const afterSecondAdd = addExerciseInsight(afterAdd, second);
const edited = { ...first, category: "range_of_motion", text: "טווח נוח ללא נעילה" };
const afterEdit = editExerciseInsight(afterSecondAdd, edited);
assert.deepEqual(afterEdit, [edited, second], "edit replaces only the matching insight");
assert.deepEqual(afterSecondAdd, [first, second], "edit does not mutate the input array");
assert.throws(
  () => editExerciseInsight(afterEdit, { ...edited, id: "missing" }),
  /was not found/,
  "editing an unknown ID fails loudly",
);

const afterDelete = deleteExerciseInsight(afterEdit, first.id);
assert.deepEqual(afterDelete, [second], "delete removes only the selected insight");
assert.deepEqual(deleteExerciseInsight(afterDelete, "missing"), afterDelete);

console.log("Exercise Insights preview: PASS (validation and local add/edit/delete behavior)");
