import assert from "node:assert/strict";

import { CORE_150_EXERCISES } from "../src/lib/core-150-exercises.ts";
import {
  calculateCore150ResolutionSummary,
  DuplicateCore150MappingError,
  resolveCore150DatabaseExercises,
} from "../src/lib/exercise-registry-assembler.ts";

const sharedRow = (id, name) => ({ id, name, owner_id: null });

const legacyResult = resolveCore150DatabaseExercises([
  sharedRow("real-legacy-id", "לחיצת חזה במוט"),
]);
assert.equal(legacyResult.resolved[0].exerciseNumber, 1);
assert.equal(legacyResult.resolved[0].canonicalHebrewName, "לחיצת חזה עם מוט");
assert.equal(legacyResult.resolved[0].sourceDatabaseName, "לחיצת חזה במוט");
assert.equal(legacyResult.resolved[0].exerciseId, "real-legacy-id");

const namingResult = resolveCore150DatabaseExercises([
  sharedRow("v2-id", "מכרע קדמי"),
  sharedRow("english-id", "Cat-Cow"),
]);
assert.deepEqual(
  namingResult.resolved.map((exercise) => exercise.exerciseNumber),
  [83, 148],
);
assert.equal(namingResult.resolved[0].exerciseId, "v2-id");
assert.equal(namingResult.resolved[1].exerciseId, "english-id");

const ignoredResult = resolveCore150DatabaseExercises([
  { id: "user-owned", name: "פלאנק", owner_id: "user-123" },
  sharedRow("non-core", "תרגיל Legacy שאינו Core"),
]);
assert.deepEqual(
  ignoredResult.ignoredDatabaseRows.map(({ row, reason }) => [row.id, reason]),
  [
    ["user-owned", "USER_OWNED"],
    ["non-core", "NON_CORE"],
  ],
);
assert.equal(ignoredResult.resolved.length, 0);

assert.throws(
  () =>
    resolveCore150DatabaseExercises([
      sharedRow("v1-row", "לחיצת חזה במוט"),
      sharedRow("v2-row", "לחיצת חזה עם מוט"),
    ]),
  (error) => {
    assert.ok(error instanceof DuplicateCore150MappingError);
    assert.equal(error.exerciseNumber, 1);
    assert.deepEqual(error.databaseRowIds, ["v1-row", "v2-row"]);
    return true;
  },
);

assert.equal(legacyResult.unresolvedCoreExercises.length, 155);
assert.ok(legacyResult.unresolvedCoreExercises.every((exercise) => exercise.exerciseNumber !== 1));

const reversedRows = [
  sharedRow("exercise-3", CORE_150_EXERCISES[2].canonicalHebrewName),
  sharedRow("exercise-1", CORE_150_EXERCISES[0].canonicalHebrewName),
  sharedRow("exercise-2", CORE_150_EXERCISES[1].canonicalHebrewName),
];
assert.deepEqual(
  resolveCore150DatabaseExercises(reversedRows).resolved.map((exercise) => exercise.exerciseNumber),
  [1, 2, 3],
);

const allCoreRows = CORE_150_EXERCISES.map((exercise) =>
  sharedRow(`database-id-${exercise.exerciseNumber}`, exercise.canonicalHebrewName),
);
const completeResult = resolveCore150DatabaseExercises([
  ...allCoreRows,
  sharedRow("extra-shared-row", "Legacy non-Core exercise"),
  { id: "private-core-name", name: "פלאנק", owner_id: "user-456" },
]);
const summary = calculateCore150ResolutionSummary(completeResult);

assert.equal(completeResult.resolved.length, 156);
assert.equal(completeResult.unresolvedCoreExercises.length, 0);
assert.deepEqual(
  completeResult.resolved.map((exercise) => exercise.exerciseNumber),
  Array.from({ length: 156 }, (_, index) => index + 1),
);
assert.deepEqual(
  completeResult.resolved.map((exercise) => exercise.exerciseId),
  Array.from({ length: 156 }, (_, index) => `database-id-${index + 1}`),
  "Assembler must preserve every caller-provided database ID",
);
assert.deepEqual(summary, {
  totalCoreExercises: 156,
  resolvedCount: 156,
  unresolvedCount: 0,
  ignoredDatabaseRowsCount: 2,
  isComplete: true,
});

assert.ok(
  completeResult.ignoredDatabaseRows.some(({ row }) => row.id === "extra-shared-row"),
  "Extra non-Core rows must not affect Core completeness",
);

console.log("Exercise Registry Phase C assembler: PASS (12 requirements verified)");
