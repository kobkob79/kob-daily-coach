import assert from "node:assert/strict";

import {
  buildExerciseRegistrySnapshot,
  calculateProgress,
  getCompleteExercises,
  getExercisesMissingCover,
  getExercisesMissingDemo,
  getExercisesMissingInfographic,
  getExercisesMissingThumbnail,
  getIncompleteExercises,
  getNextMediaProductionExercise,
  getNextRecommendedRegistryExercise,
  getNotStartedExercisesFromRegistry,
  getPartialExercisesFromRegistry,
  getRegistryExerciseById,
  getRegistryExerciseByName,
  getRegistryExerciseByNumber,
} from "../src/lib/exercise-registry-api.ts";
import { calculateExerciseDashboard } from "../src/lib/exercise-registry.ts";

const media = (overrides = {}) => ({
  hasCover: false,
  hasInfographic: false,
  hasThumbnail: false,
  hasDemo: false,
  ...overrides,
});

const entry = ({ exerciseId, exerciseNumber, media: mediaStatus, ...overrides }) => ({
  exerciseId,
  exerciseNumber,
  canonicalHebrewName: `תרגיל ${exerciseNumber}`,
  englishName: `Exercise ${exerciseNumber}`,
  aliases: [`Alias ${exerciseNumber}`],
  muscleGroup: "test",
  media: mediaStatus,
  ...overrides,
});

const records = [
  entry({
    exerciseId: "real-id-8",
    exerciseNumber: 8,
    media: media({ hasCover: true, hasInfographic: true }),
  }),
  entry({
    exerciseId: "real-id-4",
    exerciseNumber: 4,
    media: media({ hasCover: true, hasDemo: true }),
    canonicalHebrewName: "חתירה בישיבה בכבל",
    englishName: "Seated Cable Row",
    aliases: ["Cable Row"],
  }),
  entry({
    exerciseId: "real-id-2",
    exerciseNumber: 2,
    media: media({ hasInfographic: true }),
  }),
  entry({ exerciseId: "real-id-1", exerciseNumber: 1, media: media() }),
  entry({
    exerciseId: "real-id-3",
    exerciseNumber: 3,
    media: media({ hasCover: true, hasInfographic: true, hasThumbnail: true }),
    lastUpdated: "2026-08-25T12:00:00.000Z",
  }),
  entry({
    exerciseId: "real-id-6",
    exerciseNumber: 6,
    media: media({ hasCover: true, hasInfographic: true, hasThumbnail: true, hasDemo: true }),
  }),
];

const registry = {
  records,
  dashboard: calculateExerciseDashboard(records),
  resolutionSummary: {
    totalCoreExercises: 150,
    resolvedCount: records.length,
    unresolvedCount: 144,
    ignoredDatabaseRowsCount: 2,
    isComplete: false,
  },
  diagnostics: {
    unresolvedCoreExercises: [],
    ignoredDatabaseRows: 2,
    unassignedMediaPaths: ["exercises/real-id-1/legacy.jpg"],
    unexpectedMediaFolders: ["exercises/unknown"],
  },
};

// 1. The public facade preserves the existing records and real database identities.
assert.equal(registry.records, records);
assert.deepEqual(
  registry.records.map((record) => record.exerciseId),
  ["real-id-8", "real-id-4", "real-id-2", "real-id-1", "real-id-3", "real-id-6"],
);

// 2. Progress delegates to the existing dashboard calculation.
assert.deepEqual(calculateProgress(registry), calculateExerciseDashboard(records));

// 3-8. Snapshot summary, derived statuses, media gaps, and representative states.
const before = structuredClone(registry);
const snapshot = buildExerciseRegistrySnapshot(registry);
assert.deepEqual(snapshot.summary, {
  totalExercises: 6,
  completedExercises: 3,
  partialExercises: 2,
  notStartedExercises: 1,
  coversComplete: 4,
  infographicsComplete: 4,
  thumbnailsComplete: 2,
  demosComplete: 2,
  overallProgressPercent: 50,
});
assert.equal(snapshot.exercises[1].exerciseId, "real-id-4");
assert.equal(snapshot.exercises[1].status, "PARTIAL");
assert.ok(records.every((record) => !("overallStatus" in record)));
assert.deepEqual(snapshot.exercises[5].missingAssets, []);
assert.deepEqual(snapshot.exercises[1].missingAssets, ["infographic", "thumbnail"]);
assert.deepEqual(snapshot.exercises[3].missingAssets, [
  "cover",
  "infographic",
  "thumbnail",
  "demo",
]);
assert.equal(snapshot.exercises[4].lastUpdated, "2026-08-25T12:00:00.000Z");
assert.deepEqual(snapshot.diagnostics, {
  unresolvedCount: 144,
  ignoredDatabaseRows: 2,
  unassignedMediaPathsCount: 1,
  unexpectedMediaFoldersCount: 1,
});

// 9-12. Stable exact lookups reuse the Registry's existing name normalization.
assert.equal(getRegistryExerciseById(registry, "real-id-4"), records[1]);
assert.equal(getRegistryExerciseByNumber(registry, 4), records[1]);
assert.equal(getRegistryExerciseByName(registry, " חתירה בישיבה בכבל "), records[1]);
assert.equal(getRegistryExerciseByName(registry, "SEATED CABLE ROW"), records[1]);
assert.equal(getRegistryExerciseByName(registry, "Cable Row"), records[1]);

// Public status filters remain derived from media and preserve caller records.
assert.deepEqual(getCompleteExercises(registry).map((record) => record.exerciseNumber), [8, 3, 6]);
assert.deepEqual(getPartialExercisesFromRegistry(registry).map((record) => record.exerciseNumber), [4, 2]);
assert.deepEqual(getNotStartedExercisesFromRegistry(registry).map((record) => record.exerciseNumber), [1]);
assert.deepEqual(getIncompleteExercises(registry).map((record) => record.exerciseNumber), [4, 2, 1]);
assert.equal(getNextRecommendedRegistryExercise(registry), records[2]);

// Missing-media helpers are factual filters over the current media state.
assert.deepEqual(getExercisesMissingCover(registry).map((record) => record.exerciseNumber), [2, 1]);
assert.deepEqual(
  getExercisesMissingInfographic(registry).map((record) => record.exerciseNumber),
  [4, 1],
);
assert.deepEqual(
  getExercisesMissingThumbnail(registry).map((record) => record.exerciseNumber),
  [8, 4, 2, 1],
);
assert.deepEqual(getExercisesMissingDemo(registry).map((record) => record.exerciseNumber), [8, 2, 1, 3]);

// 13-14. Media-production priority is deterministic, then exerciseNumber ascending.
assert.equal(getNextMediaProductionExercise(registry), records[1]);
const equalPriorityRegistry = {
  ...registry,
  records: [records[1], entry({ exerciseId: "real-id-lower", exerciseNumber: 3, media: media({ hasCover: true }) })],
};
assert.equal(getNextMediaProductionExercise(equalPriorityRegistry)?.exerciseId, "real-id-lower");

// 15-17. No IDs are synthesized, input is not mutated, and output is JSON serializable.
assert.deepEqual(snapshot.exercises.map((record) => record.exerciseId), records.map((record) => record.exerciseId));
assert.deepEqual(registry, before);
assert.doesNotThrow(() => JSON.parse(JSON.stringify(snapshot)));

// 18. Empty Registry is safe across progress, recommendations, and snapshot generation.
const emptyRegistry = {
  records: [],
  dashboard: calculateExerciseDashboard([]),
  resolutionSummary: {
    totalCoreExercises: 150,
    resolvedCount: 0,
    unresolvedCount: 150,
    ignoredDatabaseRowsCount: 0,
    isComplete: false,
  },
  diagnostics: {
    unresolvedCoreExercises: [],
    ignoredDatabaseRows: 0,
    unassignedMediaPaths: [],
    unexpectedMediaFolders: [],
  },
};
const emptySnapshot = buildExerciseRegistrySnapshot(emptyRegistry);
assert.equal(emptySnapshot.summary.totalExercises, 0);
assert.equal(emptySnapshot.summary.overallProgressPercent, 0);
assert.equal(emptySnapshot.nextRecommendedExercise, null);
assert.deepEqual(emptySnapshot.exercises, []);
assert.equal(getNextMediaProductionExercise(emptyRegistry), null);

console.log("Exercise Registry Agent API: PASS (18 requirements verified)");
