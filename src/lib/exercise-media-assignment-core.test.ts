/**
 * Run with: node --test src/lib/exercise-media-assignment-core.test.ts
 *
 * Behavioral regression tests for exercise-media-assignment-core.ts
 * (VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001, findings F3/F5/F6).
 *
 * Unlike the previous source-regex-only test for the old inline
 * implementation, this drives the real orchestration function against an
 * in-memory fake Storage, following the same dependency-injection
 * convention exercise-motion-draft-core.test.ts already established in
 * this repo - so what's proven here is actual behavior (which calls
 * happen, in which order, with which arguments), not just that certain
 * source text exists.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  mimeTypeMatchesRole,
  performExerciseMediaAssignment,
  validateAssignmentInput,
  type AssignmentDeps,
  type StorageFile,
  type StorageOpResult,
} from "./exercise-media-assignment-core.ts";

const USER_ID = "20000000-0000-0000-0000-000000000001";
const EXERCISE_ID = "10000000-0000-0000-0000-000000000001";

interface FakeStorageState {
  /** exercise folder -> files present */
  exerciseFiles: Map<string, string[]>;
  uploaded: { path: string; bytes: Uint8Array }[];
  removedBatches: string[][];
}

interface FakeStorageOptions {
  /** Files "already in the inbox," keyed by sourcePath. */
  inbox?: Record<string, { bytes: Uint8Array; contentType: string | null }>;
  /** Pre-existing files directly under exercises/<exerciseId>/. */
  existingExerciseFiles?: string[];
  uploadFails?: boolean;
  listFails?: boolean;
  /** removeCallIndex (0-based) -> whether that call succeeds. Beyond the array, defaults to true. */
  removeOutcomes?: boolean[];
}

function buildFakeDeps(opts: FakeStorageOptions = {}): {
  deps: AssignmentDeps;
  state: FakeStorageState;
  calls: { list: number; upload: number; remove: number; download: number };
} {
  const state: FakeStorageState = {
    exerciseFiles: new Map([[EXERCISE_ID, opts.existingExerciseFiles ?? []]]),
    uploaded: [],
    removedBatches: [],
  };
  const calls = { list: 0, upload: 0, remove: 0, download: 0 };

  const deps: AssignmentDeps = {
    async downloadSource(sourcePath) {
      calls.download++;
      const file = opts.inbox?.[sourcePath];
      if (!file) return { found: false };
      return { found: true, bytes: file.bytes, contentType: file.contentType };
    },
    async listExerciseFolder(exerciseId): Promise<StorageFile[] | { failed: true }> {
      calls.list++;
      if (opts.listFails) return { failed: true };
      const names = state.exerciseFiles.get(exerciseId) ?? [];
      return names.map((name) => ({ name }));
    },
    async upload(destinationPath, bytes): Promise<StorageOpResult> {
      calls.upload++;
      if (opts.uploadFails) return { ok: false };
      state.uploaded.push({ path: destinationPath, bytes });
      // Reflect the upload into the folder listing, same as real Storage
      // (upsert: true) would - a same-extension replace overwrites the
      // existing entry rather than duplicating it.
      const folder = destinationPath.slice(0, destinationPath.lastIndexOf("/"));
      const name = destinationPath.slice(destinationPath.lastIndexOf("/") + 1);
      const existing = state.exerciseFiles.get(EXERCISE_ID) ?? [];
      const withoutSamePath = existing.filter((n) => n !== name);
      state.exerciseFiles.set(EXERCISE_ID, [...withoutSamePath, name]);
      void folder;
      return { ok: true };
    },
    async remove(paths): Promise<StorageOpResult> {
      const idx = calls.remove;
      calls.remove++;
      state.removedBatches.push(paths);
      const succeeds = opts.removeOutcomes ? (opts.removeOutcomes[idx] ?? true) : true;
      if (!succeeds) return { ok: false };
      const existing = state.exerciseFiles.get(EXERCISE_ID) ?? [];
      const removedNames = new Set(paths.map((p) => p.slice(p.lastIndexOf("/") + 1)));
      state.exerciseFiles.set(
        EXERCISE_ID,
        existing.filter((n) => !removedNames.has(n)),
      );
      return { ok: true };
    },
  };

  return { deps, state, calls };
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    sourcePath: `${USER_ID}/upload-1.mp4`,
    exerciseId: EXERCISE_ID,
    role: "demo",
    replace: false,
    ...overrides,
  };
}

const VIDEO_BYTES = new Uint8Array([1, 2, 3]);
const IMAGE_BYTES = new Uint8Array([4, 5, 6]);

// ============================================================================
// F5: strict input validation, before any Storage call.
// ============================================================================

test('F5: replace as the string "false" is rejected as invalid input, not coerced to true', () => {
  const result = validateAssignmentInput(validInput({ replace: "false" }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid_replace_flag");
});

test("F5: replace as a non-boolean truthy string is likewise rejected, never silently allowed to trigger a replace", () => {
  const result = validateAssignmentInput(validInput({ replace: "true" }));
  assert.equal(result.ok, false);
});

test("F5: replace omitted defaults to false", () => {
  const { replace: _replace, ...rest } = validInput();
  const result = validateAssignmentInput(rest);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.replace, false);
});

test("F5: exerciseId must be a valid UUID", () => {
  const result = validateAssignmentInput(validInput({ exerciseId: "not-a-uuid" }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid_exercise_id");
});

test("F5: role must be one of the closed enum values", () => {
  const result = validateAssignmentInput(validInput({ role: "banner" }));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid_role");
});

test("F5: sourcePath with a traversal segment is rejected", () => {
  const result = validateAssignmentInput(
    validInput({ sourcePath: `${USER_ID}/../other-user/secret.jpg` }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "unsafe_source_path");
});

test("F5: sourcePath with unexpected separators/characters is rejected", () => {
  for (const bad of [
    `${USER_ID}/..%2fescape.jpg`,
    `${USER_ID}//double-slash.jpg`,
    `${USER_ID}/null\0byte.jpg`,
    "",
  ]) {
    const result = validateAssignmentInput(validInput({ sourcePath: bad }));
    assert.equal(result.ok, false, `expected "${bad}" to be rejected`);
  }
});

test("F5: extension must match the role's media kind - video extension rejected for an image role", () => {
  const result = validateAssignmentInput(
    validInput({ role: "thumbnail", sourcePath: `${USER_ID}/clip.mp4` }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "extension_not_image");
});

test("F5: extension must match the role's media kind - image extension rejected for the demo (video) role", () => {
  const result = validateAssignmentInput(
    validInput({ role: "demo", sourcePath: `${USER_ID}/photo.jpg` }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "extension_not_video");
});

test("F5: a valid image extension is accepted for thumbnail/main/guide", () => {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const result = validateAssignmentInput(
      validInput({ role: "main", sourcePath: `${USER_ID}/photo.${ext}` }),
    );
    assert.equal(result.ok, true, `expected .${ext} to be accepted for role=main`);
  }
});

test("F5: mimeTypeMatchesRole - defense in depth once the real content-type is known", () => {
  assert.equal(mimeTypeMatchesRole("demo", "video/mp4"), true);
  assert.equal(mimeTypeMatchesRole("demo", "image/jpeg"), false);
  assert.equal(mimeTypeMatchesRole("thumbnail", "image/jpeg"), true);
  assert.equal(mimeTypeMatchesRole("thumbnail", "video/mp4"), false);
  assert.equal(mimeTypeMatchesRole("main", null), false);
});

test("F5/F6: invalid input never touches Storage at all", async () => {
  const { deps, calls } = buildFakeDeps();
  const result = await performExerciseMediaAssignment(
    deps,
    validInput({ role: "not-a-role" }),
    USER_ID,
  );
  assert.equal(result.status, "invalid");
  assert.deepEqual(calls, { list: 0, upload: 0, remove: 0, download: 0 });
});

test("F6: a sourcePath outside the caller's own folder is forbidden, before any Storage call", async () => {
  const { deps, calls } = buildFakeDeps();
  const result = await performExerciseMediaAssignment(
    deps,
    validInput({ sourcePath: "someone-else/file.mp4" }),
    USER_ID,
  );
  assert.equal(result.status, "forbidden");
  assert.deepEqual(calls, { list: 0, upload: 0, remove: 0, download: 0 });
});

// ============================================================================
// F6: real behavioral proofs against the fake Storage client.
// ============================================================================

test("F6: upload fails -> remove is never called, and old media (untouched in the fake) stays as it was", async () => {
  const { deps, calls, state } = buildFakeDeps({
    inbox: { [`${USER_ID}/upload-1.mp4`]: { bytes: VIDEO_BYTES, contentType: "video/mp4" } },
    existingExerciseFiles: ["demo.mov"],
    uploadFails: true,
  });

  const result = await performExerciseMediaAssignment(deps, validInput({ replace: true }), USER_ID);

  assert.equal(result.status, "upload_failed");
  assert.equal(calls.upload, 1);
  assert.equal(calls.remove, 0, "remove must never be called after a failed upload");
  assert.deepEqual(
    state.exerciseFiles.get(EXERCISE_ID),
    ["demo.mov"],
    "the old file must still be exactly as it was - the failed upload must not have touched it",
  );
});

test("F6: upload succeeds -> cleanup of stale siblings is attempted afterward", async () => {
  const { deps, calls } = buildFakeDeps({
    inbox: { [`${USER_ID}/upload-1.mp4`]: { bytes: VIDEO_BYTES, contentType: "video/mp4" } },
    existingExerciseFiles: ["demo.mov"],
  });

  const result = await performExerciseMediaAssignment(deps, validInput({ replace: true }), USER_ID);

  assert.equal(result.status, "assigned");
  assert.equal(calls.upload, 1);
  assert.ok(calls.remove >= 1, "cleanup must run after a successful upload");
});

test("F6: every stale sibling for the role is sent for removal, not just the first match", async () => {
  const { deps, state } = buildFakeDeps({
    inbox: { [`${USER_ID}/upload-1.mp4`]: { bytes: VIDEO_BYTES, contentType: "video/mp4" } },
    existingExerciseFiles: ["demo.mov", "demo.webm", "demo.old.mp4"],
  });

  const result = await performExerciseMediaAssignment(deps, validInput({ replace: true }), USER_ID);

  assert.equal(result.status, "assigned");
  const allRemoved = state.removedBatches.flat();
  assert.ok(allRemoved.includes(`exercises/${EXERCISE_ID}/demo.mov`));
  assert.ok(allRemoved.includes(`exercises/${EXERCISE_ID}/demo.webm`));
  assert.ok(allRemoved.includes(`exercises/${EXERCISE_ID}/demo.old.mp4`));
});

test("F6: the newly uploaded destination path is never sent for removal", async () => {
  const { deps, state } = buildFakeDeps({
    inbox: { [`${USER_ID}/upload-1.mp4`]: { bytes: VIDEO_BYTES, contentType: "video/mp4" } },
    // Same extension as the upload - upsert overwrites this exact entry.
    existingExerciseFiles: ["demo.mp4"],
  });

  const result = await performExerciseMediaAssignment(deps, validInput({ replace: true }), USER_ID);

  assert.equal(result.status, "assigned");
  const allRemoved = state.removedBatches.flat();
  assert.ok(
    !allRemoved.includes(`exercises/${EXERCISE_ID}/demo.mp4`),
    "the file that was just (over)written must never itself be queued for removal",
  );
});

test("F3/F6: cleanup that keeps failing reports a warning, not a plain success - and the new file stays live", async () => {
  const { deps, state, calls } = buildFakeDeps({
    inbox: { [`${USER_ID}/upload-1.mp4`]: { bytes: VIDEO_BYTES, contentType: "video/mp4" } },
    existingExerciseFiles: ["demo.mov"],
    removeOutcomes: [false, false, false], // every attempt fails
  });

  const result = await performExerciseMediaAssignment(deps, validInput({ replace: true }), USER_ID);

  assert.equal(result.status, "assigned_with_cleanup_warning");
  if (result.status === "assigned_with_cleanup_warning") {
    assert.deepEqual(result.staleSiblingPaths, [`exercises/${EXERCISE_ID}/demo.mov`]);
  }
  assert.ok(calls.remove > 1, "cleanup must have been retried, not attempted only once");
  assert.ok(
    state.uploaded.some((u) => u.path === `exercises/${EXERCISE_ID}/demo.mp4`),
    "the new file must still be live even though cleanup never succeeded",
  );
});

test("F3: cleanup retry succeeds on a later attempt -> reported as a plain, fully-clean success", async () => {
  const { deps, calls } = buildFakeDeps({
    inbox: { [`${USER_ID}/upload-1.mp4`]: { bytes: VIDEO_BYTES, contentType: "video/mp4" } },
    existingExerciseFiles: ["demo.mov"],
    removeOutcomes: [false, true], // fails once, then a retry succeeds
  });

  const result = await performExerciseMediaAssignment(deps, validInput({ replace: true }), USER_ID);

  assert.equal(result.status, "assigned");
  assert.equal(calls.remove, 2, "expected exactly one retry after the first failure");
});

test("F6: replacing at the same extension overwrites in one upload call - no stale sibling remains to clean up", async () => {
  const { deps, calls, state } = buildFakeDeps({
    inbox: { [`${USER_ID}/upload-1.mp4`]: { bytes: VIDEO_BYTES, contentType: "video/mp4" } },
    existingExerciseFiles: ["demo.mp4"],
  });

  const result = await performExerciseMediaAssignment(deps, validInput({ replace: true }), USER_ID);

  assert.equal(result.status, "assigned");
  assert.equal(calls.remove, 0, "same-extension replace needs no cleanup call at all");
  assert.deepEqual(state.exerciseFiles.get(EXERCISE_ID), ["demo.mp4"]);
});

test("existing file, replace not requested -> reports exists, uploads/removes nothing", async () => {
  const { deps, calls } = buildFakeDeps({
    inbox: { [`${USER_ID}/upload-1.mp4`]: { bytes: VIDEO_BYTES, contentType: "video/mp4" } },
    existingExerciseFiles: ["demo.mov"],
  });

  const result = await performExerciseMediaAssignment(
    deps,
    validInput({ replace: false }),
    USER_ID,
  );

  assert.equal(result.status, "exists");
  if (result.status === "exists") {
    assert.equal(result.existingPath, `exercises/${EXERCISE_ID}/demo.mov`);
  }
  assert.equal(calls.upload, 0);
  assert.equal(calls.remove, 0);
});

test("source not found in the inbox -> not_found, no upload/list/remove", async () => {
  const { deps, calls } = buildFakeDeps({});
  const result = await performExerciseMediaAssignment(deps, validInput(), USER_ID);
  assert.equal(result.status, "not_found");
  assert.equal(calls.upload, 0);
  assert.equal(calls.list, 0);
  assert.equal(calls.remove, 0);
});

test("content-type mismatch at download time is rejected before any Storage write", async () => {
  const { deps, calls } = buildFakeDeps({
    // Renamed-extension attack: filename claims .mp4, but the real bytes
    // are reported as an image by Storage.
    inbox: { [`${USER_ID}/upload-1.mp4`]: { bytes: IMAGE_BYTES, contentType: "image/jpeg" } },
  });
  const result = await performExerciseMediaAssignment(deps, validInput(), USER_ID);
  assert.equal(result.status, "invalid");
  assert.equal(calls.list, 0);
  assert.equal(calls.upload, 0);
});

test("list failure is reported distinctly and stops before any write", async () => {
  const { deps, calls } = buildFakeDeps({
    inbox: { [`${USER_ID}/upload-1.mp4`]: { bytes: VIDEO_BYTES, contentType: "video/mp4" } },
    listFails: true,
  });
  const result = await performExerciseMediaAssignment(deps, validInput(), USER_ID);
  assert.equal(result.status, "list_failed");
  assert.equal(calls.upload, 0);
  assert.equal(calls.remove, 0);
});

// ============================================================================
// F8: a dependency can genuinely *throw* (network/runtime error), not just
// return { ok: false } - performExerciseMediaAssignment() must catch that
// anywhere in the pipeline and collapse it into the single
// "unexpected_error" outcome, which structurally carries no other fields
// (see AssignmentResult) - so there is nothing for a leaked exception's
// message/code/stack to ride along in even if one were passed through.
// ============================================================================

const SECRET = "sk_live_SUPER_SECRET_DO_NOT_LEAK_4f9c2b";

function throwingDeps(overrides: Partial<AssignmentDeps> = {}): AssignmentDeps {
  const base = buildFakeDeps({
    inbox: { [`${USER_ID}/upload-1.mp4`]: { bytes: VIDEO_BYTES, contentType: "video/mp4" } },
    existingExerciseFiles: ["demo.mov"],
  }).deps;
  return { ...base, ...overrides };
}

test("F8: downloadSource throwing (with a secret in its message) is caught and reported as unexpected_error only", async () => {
  const deps = throwingDeps({
    downloadSource() {
      throw new Error(`connection reset, token=${SECRET}`);
    },
  });
  const result = await performExerciseMediaAssignment(deps, validInput(), USER_ID);
  assert.deepEqual(result, { status: "unexpected_error" });
  assert.ok(!JSON.stringify(result).includes(SECRET));
});

test("F8: listExerciseFolder throwing is caught and reported as unexpected_error only", async () => {
  const deps = throwingDeps({
    listExerciseFolder() {
      throw new Error(`postgres error: relation "storage.objects" secret=${SECRET}`);
    },
  });
  const result = await performExerciseMediaAssignment(deps, validInput(), USER_ID);
  assert.deepEqual(result, { status: "unexpected_error" });
  assert.ok(!JSON.stringify(result).includes(SECRET));
});

test("F8: upload throwing is caught and reported as unexpected_error only", async () => {
  const deps = throwingDeps({
    upload() {
      throw new Error(SECRET);
    },
  });
  const result = await performExerciseMediaAssignment(deps, validInput({ replace: true }), USER_ID);
  assert.deepEqual(result, { status: "unexpected_error" });
});

test("F8: remove throwing (during cleanup) is caught and reported as unexpected_error, not a false success", async () => {
  const deps = throwingDeps({
    remove() {
      throw new Error(SECRET);
    },
  });
  const result = await performExerciseMediaAssignment(deps, validInput({ replace: true }), USER_ID);
  assert.deepEqual(result, { status: "unexpected_error" });
});

test("F8: a non-Error thrown value (e.g. a raw object or string) is still caught safely", async () => {
  const deps = throwingDeps({
    downloadSource() {
      throw { message: SECRET, code: "PGRST_FAKE", details: SECRET, hint: SECRET };
    },
  });
  const result = await performExerciseMediaAssignment(deps, validInput(), USER_ID);
  assert.deepEqual(result, { status: "unexpected_error" });
});
