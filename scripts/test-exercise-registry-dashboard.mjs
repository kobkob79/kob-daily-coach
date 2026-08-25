import assert from "node:assert/strict";

import {
  filterExerciseRegistryRecords,
  getExerciseRegistryViewState,
} from "../src/lib/exercise-registry-dashboard.ts";
import { getExerciseRegistryStatus } from "../src/lib/exercise-registry.ts";

const record = (exerciseNumber, media) => ({
  exerciseId: `exercise-${exerciseNumber}`,
  exerciseNumber,
  canonicalHebrewName: `תרגיל ${exerciseNumber}`,
  englishName: `Exercise ${exerciseNumber}`,
  aliases: [],
  muscleGroup: "Test",
  media,
});

const none = { hasCover: false, hasInfographic: false, hasThumbnail: false, hasDemo: false };
const partial = { ...none, hasThumbnail: true };
const complete = { ...none, hasCover: true, hasInfographic: true };
const records = [record(3, none), record(1, complete), record(2, partial)];

assert.deepEqual(
  filterExerciseRegistryRecords(records, "ALL").map((item) => item.exerciseNumber),
  [1, 2, 3],
);
assert.deepEqual(
  filterExerciseRegistryRecords(records, "COMPLETE").map((item) => item.exerciseNumber),
  [1],
);
assert.deepEqual(
  filterExerciseRegistryRecords(records, "PARTIAL").map((item) => item.exerciseNumber),
  [2],
);
assert.deepEqual(
  filterExerciseRegistryRecords(records, "NOT_STARTED").map((item) => item.exerciseNumber),
  [3],
);
assert.equal(getExerciseRegistryStatus(records[0]), "NOT_STARTED");
assert.equal(
  records.some((item) => "overallStatus" in item),
  false,
);
assert.equal(getExerciseRegistryViewState({ isPending: true, isError: false }), "LOADING");
assert.equal(
  getExerciseRegistryViewState({ isPending: false, isError: true, recordCount: 0 }),
  "ERROR",
);
assert.equal(
  getExerciseRegistryViewState({ isPending: false, isError: false, recordCount: 0 }),
  "EMPTY",
);
assert.equal(
  getExerciseRegistryViewState({ isPending: false, isError: false, recordCount: 150 }),
  "READY",
);

console.log(
  "Exercise Registry Phase F dashboard logic: PASS (filtering, order, derived status, loading/error states)",
);
