import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildExerciseRegistryBridgePayload,
  createExerciseRegistryBridgeResponse,
} from "../src/lib/exercise-registry-bridge.ts";
import { calculateExerciseDashboard } from "../src/lib/exercise-registry.ts";

const media = (overrides = {}) => ({
  hasCover: false,
  hasInfographic: false,
  hasThumbnail: false,
  hasDemo: false,
  ...overrides,
});
const record = ({ exerciseId, exerciseNumber, media: mediaStatus }) => ({
  exerciseId,
  exerciseNumber,
  canonicalHebrewName: `תרגיל ${exerciseNumber}`,
  englishName: `Exercise ${exerciseNumber}`,
  aliases: [`Alias ${exerciseNumber}`],
  muscleGroup: "test",
  media: mediaStatus,
});
const records = [
  record({
    exerciseId: "real-db-id-1",
    exerciseNumber: 1,
    media: media({ hasCover: true, hasInfographic: true }),
  }),
  record({
    exerciseId: "real-db-id-2",
    exerciseNumber: 2,
    media: media({ hasCover: true }),
  }),
  record({ exerciseId: "real-db-id-3", exerciseNumber: 3, media: media() }),
];
const registry = {
  records,
  dashboard: calculateExerciseDashboard(records),
  resolutionSummary: {
    totalCoreExercises: 150,
    resolvedCount: 3,
    unresolvedCount: 147,
    ignoredDatabaseRowsCount: 1,
    isComplete: false,
  },
  diagnostics: {
    unresolvedCoreExercises: [],
    ignoredDatabaseRows: 1,
    unassignedMediaPaths: ["unassigned"],
    unexpectedMediaFolders: ["unexpected"],
  },
};

let reads = 0;
const response = await createExerciseRegistryBridgeResponse(
  new Request("https://viora.test/api/exercise-registry"),
  async () => {
    reads += 1;
    return registry;
  },
);
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
assert.equal(response.headers.get("cache-control"), "no-store");
assert.equal(reads, 1);

const payload = await response.json();
assert.equal(payload.source, "viora-exercise-registry");
assert.equal(payload.schemaVersion, 1);
assert.equal(payload.readOnly, true);
assert.deepEqual(
  payload.exercises.map((exercise) => exercise.exerciseId),
  ["real-db-id-1", "real-db-id-2", "real-db-id-3"],
);
assert.deepEqual(payload.summary, {
  totalExercises: 3,
  completedExercises: 1,
  partialExercises: 1,
  notStartedExercises: 1,
  coversComplete: 2,
  infographicsComplete: 1,
  thumbnailsComplete: 0,
  demosComplete: 0,
  overallProgressPercent: calculateExerciseDashboard(records).overallProgressPercent,
});
assert.deepEqual(payload.exercises[1].missingAssets, ["infographic", "thumbnail", "demo"]);

const serialized = JSON.stringify(payload);
for (const forbidden of [
  "users",
  "profiles",
  "email",
  "workoutHistory",
  "workoutSessions",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "Authorization",
]) {
  assert.equal(serialized.includes(forbidden), false, `must not expose ${forbidden}`);
}

const bridgeSource = await Promise.all([
  readFile(new URL("../src/routes/api/exercise-registry.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/exercise-registry-bridge.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/services/exercise-registry.service.ts", import.meta.url), "utf8"),
]).then((sources) => sources.join("\n"));
assert.match(bridgeSource, /handlers:\s*{\s*GET:/s);
for (const mutation of [".insert(", ".update(", ".upsert(", ".delete(", ".upload(", ".remove("]) {
  assert.equal(bridgeSource.includes(mutation), false, `bridge must not contain ${mutation}`);
}

const missingCover = buildExerciseRegistryBridgePayload(
  registry,
  new URLSearchParams("missing=cover"),
);
assert.deepEqual(
  missingCover.exercises.map((exercise) => exercise.exerciseNumber),
  [3],
);
const numberAndLimit = buildExerciseRegistryBridgePayload(
  registry,
  new URLSearchParams("exerciseNumber=2&limit=1"),
);
assert.deepEqual(
  numberAndLimit.exercises.map((exercise) => exercise.exerciseNumber),
  [2],
);

for (const query of [
  "limit=-1",
  "limit=0",
  "limit=151",
  "limit=abc",
  "exerciseNumber=-1",
  "missing=sql",
]) {
  const invalid = await createExerciseRegistryBridgeResponse(
    new Request(`https://viora.test/api/exercise-registry?${query}`),
    async () => registry,
  );
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "invalid_registry_query" });
}

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
const emptyResponse = await createExerciseRegistryBridgeResponse(
  new Request("https://viora.test/api/exercise-registry"),
  async () => emptyRegistry,
);
assert.equal(emptyResponse.status, 200);
assert.deepEqual((await emptyResponse.json()).exercises, []);

const unavailable = await createExerciseRegistryBridgeResponse(
  new Request("https://viora.test/api/exercise-registry"),
  async () => {
    throw new Error("secret provider detail");
  },
);
assert.equal(unavailable.status, 503);
assert.deepEqual(await unavailable.json(), { error: "exercise_registry_unavailable" });

console.log("Exercise Registry Agent Bridge: PASS (12 requirements verified)");
