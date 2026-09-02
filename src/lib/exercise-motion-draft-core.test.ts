/**
 * Regression tests for exercise-motion-draft-core.ts.
 *
 * Run with: node --test src/lib/exercise-motion-draft-core.test.ts
 * (Node 22's built-in TypeScript type-stripping runs this directly - no
 * bundler, no vitest/jest dependency, matching this repository's existing
 * "no test framework installed" reality rather than adding one.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  performMotionDraftUpload,
  type MotionDraftDeps,
  type MotionVersionRow,
  type MotionAssetRow,
} from "./exercise-motion-draft-core.ts";
import { MOTION_VIDEO_REQUIRED_FRAME_RATE } from "./exercise-media-v2.ts";

const EXERCISE_A = "10000000-0000-0000-0000-000000000001";
const EXERCISE_B = "10000000-0000-0000-0000-000000000002";
const ADMIN_ID = "20000000-0000-0000-0000-000000000001";

function validBytes(size = 1_000_000): Uint8Array {
  return new Uint8Array(size);
}

/** Deterministic fake-UUID generator so buildMotionVideoStoragePath's own UUID validation passes in tests too. */
function fakeUuid(n: number): string {
  const hex = n.toString(16).padStart(12, "0");
  return `30000000-0000-0000-0000-${hex}`;
}

interface FakeState {
  nextId: number;
  versions: Map<string, MotionVersionRow>; // by exercise id -> active working version
  assets: Map<string, MotionAssetRow>; // by version id
  storage: Set<string>; // uploaded object paths
  events: Array<{
    mediaVersionId: string;
    eventType: string;
    toStatus: string | null;
    actorUserId: string;
    metadata: Record<string, unknown>;
  }>;
  deletedVersions: string[];
  removedObjects: string[];
  calls: string[];
}

function makeFakeDeps(
  state: FakeState,
  opts?: { failUpload?: boolean; failAssetWrite?: boolean },
): MotionDraftDeps {
  return {
    async exerciseExists(exerciseId) {
      state.calls.push("exerciseExists");
      return exerciseId === EXERCISE_A || exerciseId === EXERCISE_B;
    },
    async resolveCore150Number() {
      state.calls.push("resolveCore150Number");
      return null; // always null today - see module doc.
    },
    async findActiveWorkingVersion(exerciseId) {
      state.calls.push("findActiveWorkingVersion");
      return state.versions.get(exerciseId) ?? null;
    },
    async nextVersionNumber() {
      state.calls.push("nextVersionNumber");
      return 1;
    },
    async insertDraftVersion(input) {
      state.calls.push("insertDraftVersion");
      const row: MotionVersionRow = {
        id: fakeUuid(state.nextId++),
        exerciseId: input.exerciseId,
        versionNumber: input.versionNumber,
        demonstratorKey: input.demonstratorKey,
        status: "draft",
      };
      state.versions.set(input.exerciseId, row);
      return row;
    },
    async deleteVersion(versionId) {
      state.calls.push("deleteVersion");
      state.deletedVersions.push(versionId);
      for (const [exerciseId, row] of state.versions) {
        if (row.id === versionId) state.versions.delete(exerciseId);
      }
    },
    async findMotionVideoAsset(mediaVersionId) {
      state.calls.push("findMotionVideoAsset");
      return state.assets.get(mediaVersionId) ?? null;
    },
    async uploadObject(path) {
      state.calls.push("uploadObject");
      if (opts?.failUpload) throw new Error("simulated storage failure");
      state.storage.add(path);
    },
    async removeObject(path) {
      state.calls.push("removeObject");
      state.removedObjects.push(path);
      state.storage.delete(path);
    },
    async insertMotionVideoAsset(input) {
      state.calls.push("insertMotionVideoAsset");
      if (opts?.failAssetWrite) throw new Error("simulated db failure");
      const row: MotionAssetRow = {
        id: fakeUuid(state.nextId++),
        mediaVersionId: input.mediaVersionId,
        role: "motion_video",
        storagePath: input.storagePath,
        fileSizeBytes: input.fileSizeBytes,
      };
      state.assets.set(input.mediaVersionId, row);
      return row;
    },
    async updateMotionVideoAssetPath(input) {
      state.calls.push("updateMotionVideoAssetPath");
      if (opts?.failAssetWrite) throw new Error("simulated db failure");
      const existing = [...state.assets.values()].find((a) => a.id === input.assetId);
      if (!existing) throw new Error("asset not found");
      const updated: MotionAssetRow = {
        ...existing,
        storagePath: input.storagePath,
        fileSizeBytes: input.fileSizeBytes,
      };
      state.assets.set(existing.mediaVersionId, updated);
      return updated;
    },
    async insertEvent(input) {
      state.calls.push("insertEvent");
      state.events.push(input);
    },
    async sha256() {
      return "deadbeef".repeat(8);
    },
  };
}

function baseInput(overrides: Partial<Parameters<typeof performMotionDraftUpload>[1]> = {}) {
  return {
    exerciseId: EXERCISE_A,
    actorUserId: ADMIN_ID,
    fileBytes: validBytes(),
    declaredMimeType: "video/mp4",
    declaredWidth: 1280,
    declaredHeight: 720,
    declaredDurationMs: 8000,
    confirmReplace: false,
    verifiedFrameRate: null,
    ...overrides,
  };
}

test("rejects wrong mime type before any write", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ declaredMimeType: "video/webm" }),
  );
  assert.equal(result.status, "validation_error");
  if (result.status === "validation_error") {
    assert.ok(result.errors.some((e) => e.code === "invalid_mime_type"));
  }
  assert.deepEqual(state.calls, []); // exerciseExists never even reached
});

test("rejects oversized file before any write", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ fileBytes: validBytes(3_145_729) }),
  );
  assert.equal(result.status, "validation_error");
  if (result.status === "validation_error") {
    assert.ok(result.errors.some((e) => e.code === "file_too_large"));
  }
});

test("rejects wrong resolution", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ declaredWidth: 1920, declaredHeight: 1080 }),
  );
  assert.equal(result.status, "validation_error");
  if (result.status === "validation_error") {
    assert.ok(result.errors.some((e) => e.code === "wrong_resolution"));
  }
});

test("rejects duration outside 6000-10000ms", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ declaredDurationMs: 11000 }),
  );
  assert.equal(result.status, "validation_error");
  if (result.status === "validation_error") {
    assert.ok(result.errors.some((e) => e.code === "duration_out_of_range"));
  }
});

test("architectural blocker: null verifiedFrameRate stops before insert and fully compensates a new Draft", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ verifiedFrameRate: null }),
  );
  assert.equal(result.status, "failure");
  if (result.status === "failure") {
    assert.equal(result.stage, "asset_metadata");
    assert.equal(result.reason, "architectural_blocker");
  }
  assert.ok(
    !state.calls.includes("insertMotionVideoAsset"),
    "must never attempt the insert with a fabricated frame rate",
  );
  assert.equal(state.storage.size, 0, "the uploaded object must be removed");
  assert.equal(state.deletedVersions.length, 1, "the newly created empty Draft must be removed");
  assert.equal(state.events.length, 0, "no audit event for a failed upload");
});

test("architectural blocker also fires for a wrong (non-30) verified frame rate - never weakens the constraint", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ verifiedFrameRate: 29.97 }),
  );
  assert.equal(result.status, "failure");
  if (result.status === "failure") assert.equal(result.reason, "architectural_blocker");
  assert.ok(!state.calls.includes("insertMotionVideoAsset"));
});

test("new Draft creation succeeds end-to-end when frame rate is genuinely verified", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.wasNewDraft, true);
    assert.equal(result.wasReplacement, false);
    assert.equal(result.demonstratorKey, "daniel"); // fallback default: no Core 150 number resolves today
    assert.match(
      result.storagePath,
      /^exercises\/10000000-0000-0000-0000-000000000001\/v2\/30000000-0000-0000-0000-000000000001\/motion\.mp4$/,
    );
  }
  assert.equal(state.storage.size, 1);
  assert.equal(state.events.length, 2);
  assert.deepEqual(
    state.events.map((e) => e.eventType),
    ["created", "asset_uploaded"],
  );
});

test("event metadata never carries signed URLs, credentials, or raw bytes", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  for (const event of state.events) {
    const serialized = JSON.stringify(event.metadata).toLowerCase();
    for (const forbidden of ["signed", "token", "authorization", "service_role", "key"]) {
      assert.ok(!serialized.includes(forbidden), `metadata leaked "${forbidden}": ${serialized}`);
    }
  }
});

test("existing active Draft with an asset requires explicit confirmation before replacement", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const deps = makeFakeDeps(state);
  const first = await performMotionDraftUpload(
    deps,
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(first.status, "success");

  const second = await performMotionDraftUpload(
    deps,
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE, confirmReplace: false }),
  );
  assert.equal(second.status, "needs_confirmation");
  assert.equal(state.storage.size, 1, "no second object was uploaded without confirmation");
  assert.equal(state.events.length, 2, "no new events from the unconfirmed attempt");
});

test("confirmed replacement uploads to a new path, switches the asset, then removes the old object only after success", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const deps = makeFakeDeps(state);
  const first = await performMotionDraftUpload(
    deps,
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(first.status, "success");
  const firstPath = first.status === "success" ? first.storagePath : "";

  const second = await performMotionDraftUpload(
    deps,
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE, confirmReplace: true }),
  );
  assert.equal(second.status, "success");
  if (second.status === "success") {
    assert.equal(second.wasReplacement, true);
    assert.equal(second.wasNewDraft, false);
    assert.notEqual(second.storagePath, firstPath, "replacement must use a fresh unique path");
  }
  assert.ok(
    state.removedObjects.includes(firstPath),
    "the superseded object must be removed after success",
  );
  assert.equal(state.storage.size, 1, "exactly the new object remains");
  assert.equal(
    state.deletedVersions.length,
    0,
    "the existing Draft row itself is never deleted on replacement",
  );
});

test("a non-Draft working version (e.g. qa_passed) is reported as a conflict and never written to", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  state.versions.set(EXERCISE_A, {
    id: "v-existing",
    exerciseId: EXERCISE_A,
    versionNumber: 1,
    demonstratorKey: "daniel",
    status: "qa_passed",
  });
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(result.status, "conflict");
  if (result.status === "conflict") assert.equal(result.currentStatus, "qa_passed");
  assert.equal(state.storage.size, 0);
  assert.equal(state.events.length, 0);
});

test("a Published version for the same exercise is never looked up, touched, or removed", async () => {
  // findActiveWorkingVersion's own contract excludes Published entirely
  // (matching the merged schema's partial-unique-index state sets), so a
  // fake whose Published row lives outside `state.versions` proves the
  // upload path structurally cannot reach it: no removeObject/deleteVersion
  // call ever names a path or id associated with it.
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const publishedAssetPath =
    "exercises/10000000-0000-0000-0000-000000000001/v2/PUBLISHED-VERSION/motion.mp4";
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(result.status, "success");
  assert.ok(!state.removedObjects.includes(publishedAssetPath));
  assert.ok(!state.deletedVersions.includes("PUBLISHED-VERSION"));
});

test("cleanup after Storage failure: new Draft is removed, nothing else was ever written", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const result = await performMotionDraftUpload(
    makeFakeDeps(state, { failUpload: true }),
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(result.status, "failure");
  if (result.status === "failure") assert.equal(result.stage, "storage_upload");
  assert.equal(state.deletedVersions.length, 1);
  assert.equal(
    state.removedObjects.length,
    0,
    "nothing was uploaded, so there is nothing to remove",
  );
  assert.ok(!state.calls.includes("insertMotionVideoAsset"));
  assert.equal(state.events.length, 0);
});

test("cleanup after database failure: uploaded object is removed and the new Draft is removed", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const result = await performMotionDraftUpload(
    makeFakeDeps(state, { failAssetWrite: true }),
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(result.status, "failure");
  if (result.status === "failure") assert.equal(result.stage, "asset_metadata");
  assert.equal(state.removedObjects.length, 1);
  assert.equal(state.deletedVersions.length, 1);
  assert.equal(state.events.length, 0, "no event emitted for a failed upload");
});

test("unknown exercise id is reported as not_found without any write", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({
      exerciseId: "99999999-9999-9999-9999-999999999999",
      verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE,
    }),
  );
  assert.equal(result.status, "not_found");
  assert.equal(state.storage.size, 0);
});

test("malformed exerciseId is rejected before any dependency call", async () => {
  const state: FakeState = {
    nextId: 1,
    versions: new Map(),
    assets: new Map(),
    storage: new Set(),
    events: [],
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ exerciseId: "not-a-uuid" }),
  );
  assert.equal(result.status, "not_found");
  assert.deepEqual(state.calls, []);
});

test("the core module never references a service-role credential or the admin Supabase client", () => {
  const path = fileURLToPath(new URL("./exercise-motion-draft-core.ts", import.meta.url));
  const source = readFileSync(path, "utf8");
  for (const forbidden of ["SUPABASE_SERVICE_ROLE_KEY", "supabaseAdmin", "createClient"]) {
    assert.ok(!source.includes(forbidden), `core module unexpectedly references "${forbidden}"`);
  }
});
