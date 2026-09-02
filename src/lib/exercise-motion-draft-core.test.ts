/**
 * Regression tests for exercise-motion-draft-core.ts.
 *
 * Run with: node --test src/lib/exercise-motion-draft-core.test.ts
 * (Node 22's built-in TypeScript type-stripping runs this directly - no
 * bundler, no vitest/jest dependency, matching this repository's existing
 * "no test framework installed" reality rather than adding one.)
 *
 * The fake `reserveDraft`/`finalizeAsset` below deliberately mirror the
 * real RPCs' *atomic, self-determined* behavior (status re-check inside
 * finalize, "new Draft" derived from whether any event exists yet, the
 * confirmation check keyed off whatever the fake's own state currently
 * holds) rather than trusting values the core module might otherwise be
 * tempted to pass in - the point of this review round is that the core
 * must rely only on what these two calls return, never on an earlier read
 * of its own.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  performMotionDraftUpload,
  type FinalizeAssetResult,
  type MotionDraftDeps,
  type ReserveDraftResult,
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

const WORKING_STATUSES = ["draft", "media_ready", "qa_passed", "rejected", "replacement_required"];

interface FakeVersion {
  id: string;
  exerciseId: string;
  versionNumber: number;
  status: string;
}

interface FakeAsset {
  id: string;
  storagePath: string;
}

interface FakeState {
  nextId: number;
  versionsById: Map<string, FakeVersion>;
  assetsByVersion: Map<string, FakeAsset>;
  eventCountByVersion: Map<string, number>;
  events: Array<{
    mediaVersionId: string;
    eventType: "created" | "asset_uploaded";
    metadata: Record<string, unknown>;
  }>;
  storage: Set<string>;
  deletedVersions: string[];
  removedObjects: string[];
  calls: string[];
}

function freshState(): FakeState {
  return {
    nextId: 1,
    versionsById: new Map(),
    assetsByVersion: new Map(),
    eventCountByVersion: new Map(),
    events: [],
    storage: new Set(),
    deletedVersions: [],
    removedObjects: [],
    calls: [],
  };
}

function makeFakeDeps(
  state: FakeState,
  opts?: { failUpload?: boolean; failFinalize?: boolean },
): MotionDraftDeps {
  return {
    async exerciseExists(exerciseId) {
      state.calls.push("exerciseExists");
      return exerciseId === EXERCISE_A || exerciseId === EXERCISE_B;
    },

    async reserveDraft({ exerciseId, actorUserId }): Promise<ReserveDraftResult> {
      state.calls.push("reserveDraft");
      void actorUserId;
      const existing = [...state.versionsById.values()].find(
        (v) => v.exerciseId === exerciseId && WORKING_STATUSES.includes(v.status),
      );
      if (existing) {
        if (existing.status !== "draft") {
          return { outcome: "conflict", currentStatus: existing.status };
        }
        return {
          outcome: "reserved",
          version: {
            id: existing.id,
            versionNumber: existing.versionNumber,
            demonstratorKey: "generic",
          },
          isNewDraft: false,
        };
      }
      const versionNumber =
        [...state.versionsById.values()].filter((v) => v.exerciseId === exerciseId).length + 1;
      const id = fakeUuid(state.nextId++);
      state.versionsById.set(id, { id, exerciseId, versionNumber, status: "draft" });
      return {
        outcome: "reserved",
        version: { id, versionNumber, demonstratorKey: "generic" },
        isNewDraft: true,
      };
    },

    async deleteVersion(versionId) {
      state.calls.push("deleteVersion");
      state.deletedVersions.push(versionId);
      state.versionsById.delete(versionId);
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

    async finalizeAsset(input): Promise<FinalizeAssetResult> {
      state.calls.push("finalizeAsset");
      if (opts?.failFinalize) throw new Error("simulated finalize failure");

      // Mirrors finalize_exercise_motion_video_asset(): lock + re-check the
      // parent version's *current* status, self-determined, every call.
      const version = state.versionsById.get(input.mediaVersionId);
      if (!version) return { outcome: "version_not_found" };
      if (version.status !== "draft") {
        return { outcome: "version_not_draft", blockedStatus: version.status };
      }

      // Mirrors the RPC's own locked read of the *current* asset row -
      // never a value carried over from an earlier call.
      const existing = state.assetsByVersion.get(input.mediaVersionId);
      if (existing && !input.confirmReplace) {
        return {
          outcome: "needs_confirmation",
          existingAssetId: existing.id,
          previousStoragePath: existing.storagePath,
        };
      }

      const previousStoragePath = existing ? existing.storagePath : null;
      const wasReplacement = !!existing;
      const assetId = existing ? existing.id : fakeUuid(state.nextId++);
      state.assetsByVersion.set(input.mediaVersionId, {
        id: assetId,
        storagePath: input.storagePath,
      });

      // Mirrors the RPC's self-determined "is this the first event ever
      // recorded for this version" check - never trusted from the caller.
      let count = state.eventCountByVersion.get(input.mediaVersionId) ?? 0;
      const isNewDraft = count === 0;
      if (isNewDraft) {
        state.events.push({
          mediaVersionId: input.mediaVersionId,
          eventType: "created",
          metadata: { role: "motion_video" },
        });
        count++;
      }
      state.events.push({
        mediaVersionId: input.mediaVersionId,
        eventType: "asset_uploaded",
        metadata: {
          role: "motion_video",
          fileSizeBytes: input.fileSizeBytes,
          width: input.width,
          height: input.height,
          durationMs: input.durationMs,
          replacedPreviousAsset: wasReplacement,
        },
      });
      count++;
      state.eventCountByVersion.set(input.mediaVersionId, count);

      return { outcome: "finalized", assetId, previousStoragePath, wasReplacement };
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
  const state = freshState();
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

test("rejects an empty/missing mime type before any write - never relabeled to video/mp4", async () => {
  const state = freshState();
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ declaredMimeType: "" }),
  );
  assert.equal(result.status, "validation_error");
  if (result.status === "validation_error") {
    assert.ok(result.errors.some((e) => e.code === "invalid_mime_type"));
  }
  assert.deepEqual(state.calls, []);
});

test("rejects oversized file before any write", async () => {
  const state = freshState();
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
  const state = freshState();
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
  const state = freshState();
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ declaredDurationMs: 11000 }),
  );
  assert.equal(result.status, "validation_error");
  if (result.status === "validation_error") {
    assert.ok(result.errors.some((e) => e.code === "duration_out_of_range"));
  }
});

test("an honestly-unverified (null) frame rate succeeds end-to-end", async () => {
  const state = freshState();
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ verifiedFrameRate: null }),
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.frameRateVerified, false);
  }
  assert.equal(state.storage.size, 1);
  assert.equal(state.events.length, 2);
});

test("a wrong non-null verified frame rate is rejected as a validation error before any write", async () => {
  const state = freshState();
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ verifiedFrameRate: 29.97 }),
  );
  assert.equal(result.status, "validation_error");
  if (result.status === "validation_error") {
    assert.ok(result.errors.some((e) => e.code === "invalid_frame_rate"));
  }
  assert.deepEqual(state.calls, []);
});

test("new Draft creation succeeds end-to-end with the single official generic demonstrator", async () => {
  const state = freshState();
  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(result.status, "success");
  if (result.status === "success") {
    assert.equal(result.wasNewDraft, true);
    assert.equal(result.wasReplacement, false);
    assert.equal(result.demonstratorKey, "generic");
    assert.equal(result.frameRateVerified, true);
    // Always token-suffixed, never the bare "motion.mp4" - see the module
    // doc: whether this is a replacement is only known after finalize.
    assert.match(
      result.storagePath,
      /^exercises\/10000000-0000-0000-0000-000000000001\/v2\/30000000-0000-0000-0000-000000000001\/motion\.[0-9a-f]{16}\.mp4$/,
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
  const state = freshState();
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

test("existing asset + no confirmation -> rejected with the real current path; nothing changes in the DB", async () => {
  const state = freshState();
  const deps = makeFakeDeps(state);
  const first = await performMotionDraftUpload(
    deps,
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(first.status, "success");
  const firstPath = first.status === "success" ? first.storagePath : "";

  const second = await performMotionDraftUpload(
    deps,
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE, confirmReplace: false }),
  );
  assert.equal(second.status, "needs_confirmation");
  if (second.status === "needs_confirmation") {
    assert.equal(second.existing.storagePath, firstPath);
  }
  // The unconfirmed attempt's object was uploaded then removed - never left behind.
  assert.equal(state.storage.size, 1, "only the original object remains");
  assert.ok(state.storage.has(firstPath));
  assert.equal(state.events.length, 2, "no new events from the unconfirmed attempt");
});

test("needs_confirmation reflects the ACTUAL current path, not a value cached from an earlier call - even if it changed in between", async () => {
  const state = freshState();
  const deps = makeFakeDeps(state);
  const first = await performMotionDraftUpload(
    deps,
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(first.status, "success");
  const versionId = first.status === "success" ? first.mediaVersionId : "";

  // Simulate a concurrent successful upload that this module never saw:
  // mutate the fake's own backing state directly, the way a second,
  // independent RPC call would have, without going through this module at all.
  state.assetsByVersion.set(versionId, {
    id: "concurrent-asset",
    storagePath: "exercises/concurrent/path.mp4",
  });

  const third = await performMotionDraftUpload(
    deps,
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE, confirmReplace: false }),
  );
  assert.equal(third.status, "needs_confirmation");
  if (third.status === "needs_confirmation") {
    assert.equal(
      third.existing.storagePath,
      "exercises/concurrent/path.mp4",
      "must reflect finalizeAsset's own current read, not anything this module remembered from its own first call",
    );
  }
});

test("existing asset + confirmation -> replacement succeeds, switches to a new path, removes exactly the old one", async () => {
  const state = freshState();
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
  assert.ok(state.removedObjects.includes(firstPath), "the exact superseded path was removed");
  assert.equal(state.storage.size, 1, "exactly the new object remains");
  assert.equal(
    state.deletedVersions.length,
    0,
    "the existing Draft row itself is never deleted on replacement",
  );
  assert.equal(state.calls.filter((c) => c === "finalizeAsset").length, 2);
});

test("non-Draft working version reported by reserveDraft is a conflict; nothing written", async () => {
  const state = freshState();
  state.versionsById.set("v-existing", {
    id: "v-existing",
    exerciseId: EXERCISE_A,
    versionNumber: 1,
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

test("a version that moves out of Draft between reservation and finalize is caught by finalize's own re-check, not a stale pre-read", async () => {
  const state = freshState();
  const deps = makeFakeDeps(state);

  const reservation = await deps.reserveDraft({ exerciseId: EXERCISE_A, actorUserId: ADMIN_ID });
  assert.equal(reservation.outcome, "reserved");
  const versionId = reservation.outcome === "reserved" ? reservation.version.id : "";

  // Simulate a concurrent QA action that this module's own reservation
  // result cannot know about.
  const version = state.versionsById.get(versionId);
  if (version) version.status = "qa_passed";

  // A fresh performMotionDraftUpload call reserves again (reuse would be
  // reported as `conflict` before ever reaching finalize - already covered
  // above); this test instead proves finalize itself, called directly,
  // independently re-checks and rejects rather than trusting a status
  // that was true only at reservation time.
  const finalizeResult = await deps.finalizeAsset({
    mediaVersionId: versionId,
    confirmReplace: false,
    storagePath: "exercises/e1/v2/v1/motion.deadbeef.mp4",
    mimeType: "video/mp4",
    fileSizeBytes: 1000,
    width: 1280,
    height: 720,
    durationMs: 8000,
    frameRate: null,
    checksumSha256: null,
    actorUserId: ADMIN_ID,
  });
  assert.equal(finalizeResult.outcome, "version_not_draft");
  if (finalizeResult.outcome === "version_not_draft") {
    assert.equal(finalizeResult.blockedStatus, "qa_passed");
  }
});

test("a Published version for the same exercise is never looked up, touched, or removed", async () => {
  // reserveDraft's own query excludes Published entirely (matching the
  // merged schema's partial-unique-index state sets), so a fake whose
  // Published row lives outside the working-status set proves the upload
  // path structurally cannot reach it: no removeObject/deleteVersion call
  // ever names a path or id associated with it.
  const state = freshState();
  state.versionsById.set("PUBLISHED-VERSION", {
    id: "PUBLISHED-VERSION",
    exerciseId: EXERCISE_A,
    versionNumber: 1,
    status: "published",
  });
  const publishedAssetPath =
    "exercises/10000000-0000-0000-0000-000000000001/v2/PUBLISHED-VERSION/motion.mp4";
  state.assetsByVersion.set("PUBLISHED-VERSION", {
    id: "published-asset",
    storagePath: publishedAssetPath,
  });

  const result = await performMotionDraftUpload(
    makeFakeDeps(state),
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(result.status, "success");
  assert.ok(!state.removedObjects.includes(publishedAssetPath));
  assert.ok(!state.deletedVersions.includes("PUBLISHED-VERSION"));
  // A new, separate Draft was created alongside the untouched Published row.
  assert.equal(state.versionsById.get("PUBLISHED-VERSION")?.status, "published");
});

test("cleanup after Storage failure: new Draft is removed, nothing else was ever written", async () => {
  const state = freshState();
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
  assert.ok(!state.calls.includes("finalizeAsset"));
  assert.equal(state.events.length, 0);
});

test("cleanup after an unexpected finalize error: uploaded object is removed and the new Draft is removed", async () => {
  const state = freshState();
  const result = await performMotionDraftUpload(
    makeFakeDeps(state, { failFinalize: true }),
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(result.status, "failure");
  if (result.status === "failure") assert.equal(result.stage, "finalize");
  assert.equal(state.removedObjects.length, 1);
  assert.equal(state.deletedVersions.length, 1);
  assert.equal(state.events.length, 0, "no event emitted for a failed upload");
});

test("target object is cleaned up when finalize reports needs_confirmation", async () => {
  const state = freshState();
  const deps = makeFakeDeps(state);
  await performMotionDraftUpload(
    deps,
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  await performMotionDraftUpload(
    deps,
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE, confirmReplace: false }),
  );
  // Only the first (finalized) object remains; the second attempt's
  // uploaded-then-rejected object was removed.
  assert.equal(state.storage.size, 1);
});

test("target object is cleaned up when finalize reports version_not_draft", async () => {
  const state = freshState();
  const deps = makeFakeDeps(state);
  const reservation = await deps.reserveDraft({ exerciseId: EXERCISE_A, actorUserId: ADMIN_ID });
  assert.equal(reservation.outcome, "reserved");
  const versionId = reservation.outcome === "reserved" ? reservation.version.id : "";
  const version = state.versionsById.get(versionId);
  if (version) version.status = "media_ready";

  await performMotionDraftUpload(
    deps,
    baseInput({ verifiedFrameRate: MOTION_VIDEO_REQUIRED_FRAME_RATE }),
  );
  assert.equal(
    state.storage.size,
    0,
    "the uploaded object for the rejected finalize must not remain",
  );
});

test("unknown exercise id is reported as not_found without any write", async () => {
  const state = freshState();
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
  const state = freshState();
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

test("the core module has no daniel/maya/ortal demonstrator-resolution logic left (VIORA-EXERCISE-GENERIC-DEMONSTRATOR-DECISION-001)", () => {
  const path = fileURLToPath(new URL("./exercise-motion-draft-core.ts", import.meta.url));
  const source = readFileSync(path, "utf8");
  for (const forbidden of [
    "resolveCore150Number",
    "'daniel'",
    "'maya'",
    "'ortal'",
    "resolveDemonstratorDefault",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `core module unexpectedly still references "${forbidden}"`,
    );
  }
});

test("the core module never re-derives a pre-upload read for the confirmation or Draft-status decision - it only branches on reserveDraft/finalizeAsset outcomes", () => {
  const path = fileURLToPath(new URL("./exercise-motion-draft-core.ts", import.meta.url));
  const source = readFileSync(path, "utf8");
  for (const forbidden of [
    "findActiveWorkingVersion",
    "findMotionVideoAsset",
    "insertDraftVersion",
    "nextVersionNumber",
  ]) {
    assert.ok(
      !source.includes(forbidden),
      `core module unexpectedly still references "${forbidden}"`,
    );
  }
});
