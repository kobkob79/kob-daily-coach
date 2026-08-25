import assert from "node:assert/strict";

import {
  calculateExerciseDashboard,
  calculateExerciseStatus,
  getCompletedExercises,
  getExerciseById,
  getExerciseByName,
  getNextRecommendedExercise,
  getNotStartedExercises,
  getPartialExercises,
  getExerciseRegistryStatus,
} from "../src/lib/exercise-registry.ts";

const media = (overrides = {}) => ({
  hasCover: false,
  hasInfographic: false,
  hasThumbnail: false,
  hasDemo: false,
  ...overrides,
});

const record = ({ exerciseId, exerciseNumber, media: mediaStatus, ...overrides }) => ({
  exerciseId,
  exerciseNumber,
  canonicalHebrewName: `תרגיל ${exerciseNumber}`,
  englishName: `Exercise ${exerciseNumber}`,
  aliases: [`Alias ${exerciseNumber}`],
  muscleGroup: "chest",
  media: mediaStatus,
  ...overrides,
});

assert.equal(calculateExerciseStatus(media({ hasCover: true, hasInfographic: true })), "COMPLETE");
assert.equal(calculateExerciseStatus(media({ hasCover: true })), "PARTIAL");
assert.equal(calculateExerciseStatus(media({ hasInfographic: true })), "PARTIAL");
assert.equal(calculateExerciseStatus(media({ hasThumbnail: true })), "PARTIAL");
assert.equal(calculateExerciseStatus(media()), "NOT_STARTED");
assert.equal(calculateExerciseStatus(media({ hasDemo: true })), "PARTIAL");

const records = [
  record({
    exerciseId: "db-exercise-3",
    exerciseNumber: 3,
    media: media({ hasCover: true, hasInfographic: true, hasThumbnail: true }),
  }),
  record({ exerciseId: "db-exercise-2", exerciseNumber: 2, media: media() }),
  record({ exerciseId: "db-exercise-4", exerciseNumber: 4, media: media({ hasDemo: true }) }),
  record({
    exerciseId: "db-exercise-1",
    exerciseNumber: 1,
    media: media({ hasCover: true }),
    canonicalHebrewName: "לחיצת חזה עם מוט",
    englishName: "Barbell Bench Press",
    aliases: ["לחיצת חזה במוט", "Bench Press"],
  }),
];

assert.deepEqual(
  getCompletedExercises(records).map((item) => item.exerciseId),
  ["db-exercise-3"],
);
assert.deepEqual(
  getPartialExercises(records).map((item) => item.exerciseId),
  ["db-exercise-4", "db-exercise-1"],
);
assert.deepEqual(
  getNotStartedExercises(records).map((item) => item.exerciseId),
  ["db-exercise-2"],
);

const dashboard = calculateExerciseDashboard(records);
assert.deepEqual(
  {
    total: dashboard.totalExercises,
    complete: dashboard.completedExercises,
    partial: dashboard.partialExercises,
    notStarted: dashboard.notStartedExercises,
    covers: dashboard.coversComplete,
    infographics: dashboard.infographicsComplete,
    thumbnails: dashboard.thumbnailsComplete,
    demos: dashboard.demosComplete,
  },
  {
    total: 4,
    complete: 1,
    partial: 2,
    notStarted: 1,
    covers: 2,
    infographics: 1,
    thumbnails: 1,
    demos: 1,
  },
);
assert.equal(dashboard.overallProgressPercent, 25);
assert.equal(calculateExerciseDashboard([]).overallProgressPercent, 0);
assert.ok(records.every((item) => !("overallStatus" in item)));
assert.deepEqual(records.map(getExerciseRegistryStatus), [
  "COMPLETE",
  "NOT_STARTED",
  "PARTIAL",
  "PARTIAL",
]);

assert.equal(getNextRecommendedExercise(records)?.exerciseId, "db-exercise-1");
assert.equal(
  getNextRecommendedExercise(
    records.filter((item) => getExerciseRegistryStatus(item) !== "PARTIAL"),
  )?.exerciseId,
  "db-exercise-2",
);
assert.equal(
  getNextRecommendedExercise(
    records.filter((item) => getExerciseRegistryStatus(item) === "COMPLETE"),
  ),
  null,
);

assert.equal(getExerciseById(records, "db-exercise-1"), records[3]);
assert.equal(getExerciseById(records, "missing"), undefined);
assert.equal(getExerciseByName(records, " לחיצת חזה עם מוט "), records[3]);
assert.equal(getExerciseByName(records, "BARBELL BENCH PRESS"), records[3]);
assert.equal(getExerciseByName(records, "Bench Press"), records[3]);
assert.equal(getExerciseByName(records, "unknown"), undefined);
assert.throws(
  () =>
    getExerciseByName(
      [
        records[3],
        record({
          exerciseId: "duplicate-name",
          exerciseNumber: 5,
          media: media(),
          aliases: ["Bench Press"],
        }),
      ],
      "Bench Press",
    ),
  /Ambiguous Exercise Registry name/,
);

assert.deepEqual(
  records.map((item) => item.exerciseId),
  ["db-exercise-3", "db-exercise-2", "db-exercise-4", "db-exercise-1"],
  "Registry logic must preserve caller-provided exercise IDs",
);

console.log("Exercise Registry Engine Phase B: PASS (15 requirements verified)");
