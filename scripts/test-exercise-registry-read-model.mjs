import assert from "node:assert/strict";

import { CORE_150_EXERCISES } from "../src/lib/core-150-exercises.ts";
import {
  buildExerciseRegistryReadModel,
  loadExerciseRegistryReadModel,
} from "../src/lib/exercise-registry-read-model.ts";
import { DuplicateCore150MappingError } from "../src/lib/exercise-registry-assembler.ts";
import { DuplicateExerciseMediaRoleError } from "../src/lib/exercise-registry-media.ts";
import { getExerciseRegistryStatus } from "../src/lib/exercise-registry.ts";

const row = (exercise, overrides = {}) => ({
  id: `real-db-id-${exercise.exerciseNumber}`,
  name: exercise.canonicalHebrewName,
  owner_id: null,
  ...overrides,
});
const media = (exerciseId, name, overrides = {}) => ({
  path: `exercises/${exerciseId}/${name}`,
  name,
  folder: exerciseId,
  kind: name.toLowerCase().endsWith(".mp4") ? "video" : "image",
  mimeType: null,
  size: null,
  updatedAt: null,
  url: "",
  ...overrides,
});

const allRows = CORE_150_EXERCISES.map((exercise) => row(exercise));
const emptyRegistry = buildExerciseRegistryReadModel(allRows, []);
assert.equal(emptyRegistry.records.length, 150);
assert.equal(emptyRegistry.dashboard.totalExercises, 150);
assert.equal(emptyRegistry.dashboard.notStartedExercises, 150);
assert.equal(emptyRegistry.dashboard.partialExercises, 0);
assert.equal(emptyRegistry.dashboard.completedExercises, 0);
assert.ok(
  emptyRegistry.records.every((record) => getExerciseRegistryStatus(record) === "NOT_STARTED"),
);

const firstId = allRows[0].id;
const secondId = allRows[1].id;
const populatedRegistry = buildExerciseRegistryReadModel(allRows, [
  media(firstId, "main.jpg"),
  media(firstId, "guide.webp"),
  media(secondId, "main.png"),
  media("another-exercise", "guide.webp"),
]);

assert.equal(getExerciseRegistryStatus(populatedRegistry.records[0]), "COMPLETE");
assert.equal(getExerciseRegistryStatus(populatedRegistry.records[1]), "PARTIAL");
assert.equal(populatedRegistry.dashboard.completedExercises, 1);
assert.equal(populatedRegistry.dashboard.partialExercises, 1);
assert.equal(populatedRegistry.dashboard.notStartedExercises, 148);
assert.equal(populatedRegistry.dashboard.coversComplete, 2);
assert.equal(populatedRegistry.dashboard.infographicsComplete, 1);
assert.ok(
  populatedRegistry.diagnostics.unexpectedMediaFolders.includes("exercises/another-exercise"),
);

const auditRegistry = buildExerciseRegistryReadModel(
  [
    ...allRows.slice(0, 149),
    { id: "extra-shared", name: "Legacy non-Core", owner_id: null },
    { id: "user-owned", name: "הרחקת ירך בשכיבה על הצד", owner_id: "user-id" },
  ],
  [],
);
assert.equal(auditRegistry.records.length, 149);
assert.equal(auditRegistry.resolutionSummary.unresolvedCount, 1);
assert.equal(auditRegistry.resolutionSummary.ignoredDatabaseRowsCount, 2);
assert.equal(auditRegistry.diagnostics.unresolvedCoreExercises.length, 1);
assert.equal(auditRegistry.diagnostics.unresolvedCoreExercises[0].exerciseNumber, 150);
assert.equal(auditRegistry.diagnostics.ignoredDatabaseRows, 2);

assert.throws(
  () =>
    buildExerciseRegistryReadModel(
      [allRows[0], { ...allRows[0], id: "duplicate-db-id", name: "לחיצת חזה במוט" }],
      [],
    ),
  DuplicateCore150MappingError,
);
assert.throws(
  () =>
    buildExerciseRegistryReadModel(allRows, [
      media(firstId, "main.jpg"),
      media(firstId, "MAIN.webp"),
    ]),
  DuplicateExerciseMediaRoleError,
);

assert.deepEqual(
  populatedRegistry.records.map((record) => record.exerciseNumber),
  Array.from({ length: 150 }, (_, index) => index + 1),
);
assert.deepEqual(
  populatedRegistry.records.map((record) => record.exerciseId),
  Array.from({ length: 150 }, (_, index) => `real-db-id-${index + 1}`),
);
assert.ok(populatedRegistry.records.every((record) => !("overallStatus" in record)));

const databaseFailure = new Error("database read failed");
await assert.rejects(
  loadExerciseRegistryReadModel({
    readDatabaseExercises: async () => {
      throw databaseFailure;
    },
    readStorageItems: async () => [],
  }),
  (error) => error === databaseFailure,
);

const storageFailure = new Error("storage read failed");
await assert.rejects(
  loadExerciseRegistryReadModel({
    readDatabaseExercises: async () => allRows,
    readStorageItems: async () => {
      throw storageFailure;
    },
  }),
  (error) => error === storageFailure,
);

console.log("Exercise Registry Phase E read model: PASS (14 requirements verified)");
