/**
 * Run with: node --test src/lib/coach-debrief-persistence.server.test.ts
 *
 * Codex re-review round 2, blocker 4 (VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1):
 * supabase-js resolves a business-logic failure (RLS denial, a trigger
 * raising, a constraint violation) as `{ data: null, error }` — it does
 * NOT reject the promise. A bare try/catch around the call never sees
 * that. These tests prove save/load handle `{ error }` explicitly: they
 * never throw toward the caller (still best-effort), and they never
 * silently report success/data when the query actually failed.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  loadWorkoutDebriefSnapshot,
  saveWorkoutDebriefSnapshot,
} from "./coach-debrief-persistence.server.ts";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "22222222-2222-2222-2222-222222222222";

const SAMPLE_DEBRIEF = {
  greeting: "היי",
  paragraphs: ["פסקה"],
  highlights: ["שיא"],
  nextFocus: null,
  recovery: null,
  nutrition: null,
  hydration: null,
};

function makeUpsertClient(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      upsert: async () => result,
    }),
  };
}

function makeUpsertThrowingClient(error: unknown) {
  return {
    from: () => ({
      upsert: async () => {
        throw error;
      },
    }),
  };
}

function makeSelectClient(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => result,
          }),
        }),
      }),
    }),
  };
}

describe("saveWorkoutDebriefSnapshot — { error } without throw (Codex re-review round 2, blocker 4)", () => {
  test("resolves true on a genuine success", async () => {
    const client = makeUpsertClient({ data: null, error: null });
    const ok = await saveWorkoutDebriefSnapshot(
      client as never,
      USER_ID,
      SESSION_ID,
      SAMPLE_DEBRIEF,
    );
    assert.equal(ok, true);
  });

  test("a { error } result (RLS denial / trigger raise / constraint violation) resolves false, never throws", async () => {
    const client = makeUpsertClient({
      data: null,
      error: { code: "42501", message: "new row violates row-level security policy" },
    });
    const ok = await saveWorkoutDebriefSnapshot(
      client as never,
      USER_ID,
      SESSION_ID,
      SAMPLE_DEBRIEF,
    );
    assert.equal(
      ok,
      false,
      "a failed write must be reported as failed, not silently treated as success",
    );
  });

  test("a thrown exception (network failure) is also caught and reported as a failed save, not propagated", async () => {
    const client = makeUpsertThrowingClient(new Error("fetch failed"));
    await assert.doesNotReject(
      saveWorkoutDebriefSnapshot(client as never, USER_ID, SESSION_ID, SAMPLE_DEBRIEF),
    );
    const ok = await saveWorkoutDebriefSnapshot(
      client as never,
      USER_ID,
      SESSION_ID,
      SAMPLE_DEBRIEF,
    );
    assert.equal(ok, false);
  });
});

describe("loadWorkoutDebriefSnapshot — { error } without throw", () => {
  test("returns the mapped debrief on a genuine hit", async () => {
    const client = makeSelectClient({
      data: {
        greeting: "היי",
        paragraphs: ["פסקה"],
        highlights: ["שיא"],
        next_focus: null,
        recovery: null,
        nutrition: null,
        hydration: null,
      },
      error: null,
    });
    const debrief = await loadWorkoutDebriefSnapshot(client as never, USER_ID, SESSION_ID);
    assert.notEqual(debrief, null);
    assert.equal(debrief!.greeting, "היי");
  });

  test("a { error } result is treated as unavailable (null), never thrown, never mistaken for real data", async () => {
    const client = makeSelectClient({
      data: null,
      error: { code: "08006", message: "connection failure" },
    });
    const debrief = await loadWorkoutDebriefSnapshot(client as never, USER_ID, SESSION_ID);
    assert.equal(debrief, null);
  });

  test("no row found (data null, no error) is also null", async () => {
    const client = makeSelectClient({ data: null, error: null });
    const debrief = await loadWorkoutDebriefSnapshot(client as never, USER_ID, SESSION_ID);
    assert.equal(debrief, null);
  });
});
