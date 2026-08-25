import assert from "node:assert/strict";

import { resolveCore150DatabaseExercises } from "../src/lib/exercise-registry-assembler.ts";
import {
  DuplicateExerciseMediaRoleError,
  resolveAssignedExerciseMedia,
  resolveExerciseMediaStatus,
} from "../src/lib/exercise-registry-media.ts";
import { getExerciseRegistryStatus } from "../src/lib/exercise-registry.ts";

const exerciseId = "real-db-exercise-id";
const item = (name, overrides = {}) => ({
  path: `exercises/${exerciseId}/${name}`,
  name,
  folder: "",
  kind: name.toLowerCase().endsWith(".mp4") ? "video" : "image",
  mimeType: null,
  size: null,
  updatedAt: null,
  url: "",
  ...overrides,
});

const emptyStatus = {
  hasCover: false,
  hasInfographic: false,
  hasThumbnail: false,
  hasDemo: false,
};

assert.deepEqual(resolveExerciseMediaStatus([], exerciseId), emptyStatus);
assert.deepEqual(resolveExerciseMediaStatus([item("main.jpg")], exerciseId), {
  ...emptyStatus,
  hasCover: true,
});
assert.deepEqual(resolveExerciseMediaStatus([item("guide.webp")], exerciseId), {
  ...emptyStatus,
  hasInfographic: true,
});
assert.deepEqual(resolveExerciseMediaStatus([item("thumbnail.png")], exerciseId), {
  ...emptyStatus,
  hasThumbnail: true,
});
assert.deepEqual(resolveExerciseMediaStatus([item("demo.mp4")], exerciseId), {
  ...emptyStatus,
  hasDemo: true,
});

const completeMedia = resolveExerciseMediaStatus(
  [item("main.jpg"), item("guide.webp")],
  exerciseId,
);
assert.deepEqual(completeMedia, {
  hasCover: true,
  hasInfographic: true,
  hasThumbnail: false,
  hasDemo: false,
});

assert.deepEqual(resolveExerciseMediaStatus([item("main.jpg")], exerciseId), {
  ...emptyStatus,
  hasCover: true,
});
assert.deepEqual(
  resolveExerciseMediaStatus(
    [item("hero.jpg"), item("cover.png"), item("primary.webp")],
    exerciseId,
  ),
  emptyStatus,
);
assert.deepEqual(resolveExerciseMediaStatus([item("workout.mp4")], exerciseId), emptyStatus);
assert.deepEqual(resolveExerciseMediaStatus([item("MAIN.JPG"), item("GUIDE.WEBP")], exerciseId), {
  hasCover: true,
  hasInfographic: true,
  hasThumbnail: false,
  hasDemo: false,
});
assert.deepEqual(resolveExerciseMediaStatus([item("notes.txt")], exerciseId), emptyStatus);
assert.deepEqual(
  resolveExerciseMediaStatus(
    [item("main.jpg"), item("guide.webp", { path: "exercises/another-exercise/guide.webp" })],
    exerciseId,
  ),
  { ...emptyStatus, hasCover: true },
);

assert.throws(
  () => resolveAssignedExerciseMedia([item("main.jpg"), item("MAIN.webp")], exerciseId),
  (error) => {
    assert.ok(error instanceof DuplicateExerciseMediaRoleError);
    assert.equal(error.role, "main");
    assert.equal(error.paths.length, 2);
    return true;
  },
);

const [identity] = resolveCore150DatabaseExercises([
  { id: exerciseId, name: "לחיצת חזה במוט", owner_id: null },
]).resolved;
const registryRecord = { ...identity, media: completeMedia };

assert.equal(registryRecord.exerciseId, exerciseId);
assert.equal(getExerciseRegistryStatus(registryRecord), "COMPLETE");
assert.ok(!("id" in completeMedia) && !("exerciseId" in completeMedia));

console.log("Exercise Registry Phase D media resolver: PASS (12 requirements verified)");
