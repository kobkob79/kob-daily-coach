import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  hasMeaningfulSnapshotChange,
  normalizeExerciseRegistrySnapshot,
  serializeExerciseRegistrySnapshot,
  validateSnapshotTopLevelKeys,
} from "./exercise-registry-snapshot-lib.mjs";

const exercise = (number) => ({
  exerciseId: `exercise-${number}`,
  exerciseNumber: number,
  canonicalHebrewName: `תרגיל ${number}`,
  englishName: `Exercise ${number}`,
  muscleGroup: "test",
  status: "PARTIAL",
  media: {
    hasCover: true,
    hasInfographic: false,
    hasThumbnail: false,
    hasDemo: false,
  },
  missingAssets: ["demo", "infographic", "thumbnail"],
});
const input = {
  generatedAt: "2026-08-26T10:00:00.000Z",
  source: "untrusted-source",
  schemaVersion: 999,
  readOnly: false,
  summary: {
    totalExercises: 2,
    completedExercises: 0,
    partialExercises: 2,
    notStartedExercises: 0,
    coversComplete: 2,
    infographicsComplete: 0,
    thumbnailsComplete: 0,
    demosComplete: 0,
    overallProgressPercent: 0,
  },
  nextRecommendedExercise: exercise(1),
  exercises: [exercise(2), exercise(1)],
  diagnostics: {
    unresolvedCount: 148,
    ignoredDatabaseRows: 0,
    unassignedMediaPathsCount: 0,
    unexpectedMediaFoldersCount: 0,
  },
  SUPABASE_SERVICE_ROLE_KEY: "must-not-survive",
  users: [{ email: "must-not-survive@example.com" }],
};

const normalized = normalizeExerciseRegistrySnapshot(input);
assert.equal(normalized.source, "viora-exercise-registry");
assert.equal(normalized.schemaVersion, 1);
assert.equal(normalized.readOnly, true);
assert.ok(normalized.summary);
assert.ok(Array.isArray(normalized.exercises));
assert.ok(normalized.diagnostics);
assert.equal(validateSnapshotTopLevelKeys(normalized), true);
assert.deepEqual(normalized.exercises.map((item) => item.exerciseNumber), [1, 2]);
assert.deepEqual(normalized.exercises[0].missingAssets, ["infographic", "thumbnail", "demo"]);

const text = serializeExerciseRegistrySnapshot(input);
assert.equal(text, serializeExerciseRegistrySnapshot(structuredClone(input)));
assert.equal(text.endsWith("\n"), true);
assert.deepEqual(JSON.parse(text), normalized);
assert.equal(text.includes("generatedAt"), false);
assert.equal(text.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
assert.equal(text.includes("must-not-survive"), false);

const generatedAtOnly = { ...input, generatedAt: "2030-01-01T00:00:00.000Z" };
assert.equal(
  hasMeaningfulSnapshotChange(text, serializeExerciseRegistrySnapshot(generatedAtOnly)),
  false,
);
assert.equal(
  hasMeaningfulSnapshotChange(text, serializeExerciseRegistrySnapshot({
    ...input,
    summary: { ...input.summary, completedExercises: 1 },
  })),
  true,
);
assert.equal(hasMeaningfulSnapshotChange(null, text), true);

assert.equal(normalizeExerciseRegistrySnapshot({ ...input, nextRecommendedExercise: null }).nextRecommendedExercise, null);
assert.throws(
  () => normalizeExerciseRegistrySnapshot({ ...input, nextRecommendedExercise: undefined }),
  /nextRecommendedExercise/,
);
assert.throws(() => normalizeExerciseRegistrySnapshot({ ...input, exercises: null }), /exercises/);

const stored = JSON.parse(
  await readFile(new URL("../agent-data/exercise-registry.snapshot.json", import.meta.url), "utf8"),
);
const storedNormalized = normalizeExerciseRegistrySnapshot(stored);
assert.deepEqual(stored, storedNormalized);

console.log("Exercise Registry GitHub Snapshot: PASS (determinism, contract, sanitization, ordering)");
