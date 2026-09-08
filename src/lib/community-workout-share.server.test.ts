/**
 * Run with: node --test src/lib/community-workout-share.server.test.ts
 *
 * VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1 — server-side publish authorization
 * and idempotency, exercised against a fake Supabase-shaped client (no
 * live database; RLS itself isn't executable here, so these tests instead
 * prove the *code* — not just the policy — enforces ownership scoping,
 * source-uniqueness handling, and never trusts client-provided ids).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  findExistingWorkoutShareResult,
  publishWorkoutShareResult,
} from "./community-workout-share.server.ts";
import type { PublishWorkoutShareInput } from "./community-workout-share.functions.ts";

const OWNER_ID = "user-owner";
const OTHER_USER_ID = "user-other";
const SESSION_ID = "session-1";

interface FakeSessionRow {
  id: string;
  user_id: string;
  name: string | null;
  started_at: string;
  duration_seconds: number | null;
  status: string;
}

interface FakeState {
  sessions: FakeSessionRow[];
  sets: Array<{
    session_id: string;
    user_id: string;
    exercise_id: string;
    set_number: number;
    weight_kg: number | null;
    reps: number | null;
    is_warmup: boolean;
    completed_at: string | null;
    position: number;
  }>;
  exercises: Array<{ id: string; name: string; muscle_group: string | null }>;
  posts: Array<{
    id: string;
    user_id: string;
    source_type: string | null;
    source_id: string | null;
    payload: unknown;
  }>;
  insertBehavior: "success" | "unique_violation" | "other_error";
  insertCalls: Array<Record<string, unknown>>;
}

/** A tiny chainable stand-in for the subset of the Supabase query builder this module uses. */
function makeFakeClient(state: FakeState) {
  function sessionsQuery() {
    const filters: Record<string, unknown> = {};
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return api;
      },
      maybeSingle: async () => {
        const row = state.sessions.find((s) =>
          Object.entries(filters).every(
            ([k, v]) => (s as unknown as Record<string, unknown>)[k] === v,
          ),
        );
        return { data: row ?? null, error: null };
      },
    };
    return api;
  }

  function setsQuery() {
    const filters: Record<string, unknown> = {};
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return api;
      },
      order: async () => {
        const rows = state.sets
          .filter((s) =>
            Object.entries(filters).every(
              ([k, v]) => (s as unknown as Record<string, unknown>)[k] === v,
            ),
          )
          .sort((a, b) => a.position - b.position);
        return { data: rows, error: null };
      },
    };
    return api;
  }

  function exercisesQuery() {
    const api = {
      select: () => api,
      in: async (_col: string, ids: string[]) => ({
        data: state.exercises.filter((e) => ids.includes(e.id)),
        error: null,
      }),
    };
    return api;
  }

  function profilesQuery() {
    const api = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => ({ data: { display_name: "בודק" }, error: null }),
    };
    return api;
  }

  function postsQuery() {
    const filters: Record<string, unknown> = {};
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return api;
      },
      maybeSingle: async () => {
        const row = state.posts.find((p) =>
          Object.entries(filters).every(
            ([k, v]) => (p as unknown as Record<string, unknown>)[k] === v,
          ),
        );
        return { data: row ?? null, error: null };
      },
      insert: (values: Record<string, unknown>) => {
        state.insertCalls.push(values);
        return {
          select: () => ({
            single: async () => {
              if (state.insertBehavior === "unique_violation") {
                return { data: null, error: { code: "23505", message: "duplicate key" } };
              }
              if (state.insertBehavior === "other_error") {
                return { data: null, error: { code: "XXXXX", message: "boom" } };
              }
              const id = `post-${state.posts.length + 1}`;
              state.posts.push({
                id,
                user_id: values.user_id as string,
                source_type: values.source_type as string | null,
                source_id: values.source_id as string | null,
                payload: values.payload,
              });
              return { data: { id }, error: null };
            },
          }),
        };
      },
    };
    return api;
  }

  return {
    from(table: string) {
      if (table === "workout_sessions") return sessionsQuery();
      if (table === "workout_sets") return setsQuery();
      if (table === "exercises") return exercisesQuery();
      if (table === "profiles") return profilesQuery();
      if (table === "community_posts") return postsQuery();
      throw new Error(`unexpected table in test: ${table}`);
    },
    // Minimal shape cast to SupabaseClient at the call site.
  };
}

function baseState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    sessions: [
      {
        id: SESSION_ID,
        user_id: OWNER_ID,
        name: "יום חזה",
        started_at: "2026-09-08T09:00:00.000Z",
        duration_seconds: 1800,
        status: "completed",
      },
    ],
    sets: [
      {
        session_id: SESSION_ID,
        user_id: OWNER_ID,
        exercise_id: "ex-1",
        set_number: 1,
        weight_kg: 40,
        reps: 10,
        is_warmup: false,
        completed_at: "2026-09-08T09:10:00.000Z",
        position: 1,
      },
    ],
    exercises: [{ id: "ex-1", name: "לחיצת חזה", muscle_group: "חזה" }],
    posts: [],
    insertBehavior: "success",
    insertCalls: [],
    ...overrides,
  };
}

function basePublishInput(
  overrides: Partial<PublishWorkoutShareInput> = {},
): PublishWorkoutShareInput {
  return {
    sessionId: SESSION_ID,
    caption: null,
    photoPath: null,
    audience: "public",
    locationLabel: null,
    includeCoach: false,
    coach: null,
    ...overrides,
  };
}

describe("publishWorkoutShareResult — authorization", () => {
  test("a foreign session id (belongs to another user) is rejected as not found", async () => {
    const state = baseState();
    const client = makeFakeClient(state);
    // Same session id, but requested as a different user than its owner.
    const result = await publishWorkoutShareResult(
      client as never,
      OTHER_USER_ID,
      basePublishInput(),
    );
    assert.equal(result.status, "error");
    assert.equal((result as { reason: string }).reason, "SESSION_NOT_FOUND");
    assert.equal(state.insertCalls.length, 0, "must never insert without a real owned session");
  });

  test("a genuinely unknown session id is rejected as not found", async () => {
    const state = baseState();
    const client = makeFakeClient(state);
    const result = await publishWorkoutShareResult(
      client as never,
      OWNER_ID,
      basePublishInput({ sessionId: "does-not-exist" }),
    );
    assert.equal(result.status, "error");
    assert.equal((result as { reason: string }).reason, "SESSION_NOT_FOUND");
  });

  test("an in-progress (not completed) session cannot be shared", async () => {
    const state = baseState();
    state.sessions[0]!.status = "in_progress";
    const client = makeFakeClient(state);
    const result = await publishWorkoutShareResult(client as never, OWNER_ID, basePublishInput());
    assert.equal(result.status, "error");
    assert.equal((result as { reason: string }).reason, "SESSION_NOT_COMPLETED");
  });

  test("a valid owned, completed session publishes successfully", async () => {
    const state = baseState();
    const client = makeFakeClient(state);
    const result = await publishWorkoutShareResult(client as never, OWNER_ID, basePublishInput());
    assert.equal(result.status, "published");
    assert.equal(state.insertCalls.length, 1);
    assert.equal(state.insertCalls[0]!.user_id, OWNER_ID);
    assert.equal(state.insertCalls[0]!.source_id, SESSION_ID);
    assert.equal(state.insertCalls[0]!.post_type, "workout_result");
  });

  test("the server never trusts a client-supplied user id — it is always the authenticated caller's own id", async () => {
    // PublishWorkoutShareInput has no userId field at all; this proves the
    // insert always uses the server-derived userId argument, not anything
    // from `data`.
    const state = baseState();
    const client = makeFakeClient(state);
    await publishWorkoutShareResult(client as never, OWNER_ID, basePublishInput());
    assert.equal(state.insertCalls[0]!.user_id, OWNER_ID);
  });
});

describe("publishWorkoutShareResult — idempotency", () => {
  test("a unique-violation on insert (double tap / concurrent publish) resolves to the existing post, not an error", async () => {
    const state = baseState({ insertBehavior: "unique_violation" });
    state.posts.push({
      id: "existing-post",
      user_id: OWNER_ID,
      source_type: "workout",
      source_id: SESSION_ID,
      payload: { version: 1 },
    });
    const client = makeFakeClient(state);
    const result = await publishWorkoutShareResult(client as never, OWNER_ID, basePublishInput());
    assert.equal(result.status, "already_shared");
    assert.equal((result as { postId: string }).postId, "existing-post");
  });

  test("a genuine, non-uniqueness insert failure surfaces as a safe, generic error", async () => {
    const state = baseState({ insertBehavior: "other_error" });
    const client = makeFakeClient(state);
    const result = await publishWorkoutShareResult(client as never, OWNER_ID, basePublishInput());
    assert.equal(result.status, "error");
    assert.equal((result as { reason: string }).reason, "PERSISTENCE_UNAVAILABLE");
  });
});

describe("findExistingWorkoutShareResult — reopening an already-shared workout", () => {
  test("finds the existing post for this user + session", async () => {
    const state = baseState();
    state.posts.push({
      id: "existing-post",
      user_id: OWNER_ID,
      source_type: "workout",
      source_id: SESSION_ID,
      payload: { version: 1 },
    });
    const client = makeFakeClient(state);
    const result = await findExistingWorkoutShareResult(client as never, OWNER_ID, SESSION_ID);
    assert.equal(result.status, "found");
    assert.equal((result as { postId: string }).postId, "existing-post");
  });

  test("returns not_found when nothing has been shared yet", async () => {
    const state = baseState();
    const client = makeFakeClient(state);
    const result = await findExistingWorkoutShareResult(client as never, OWNER_ID, SESSION_ID);
    assert.equal(result.status, "not_found");
  });

  test("another user's existing post for the same session id is invisible", async () => {
    const state = baseState();
    state.posts.push({
      id: "someone-elses-post",
      user_id: OTHER_USER_ID,
      source_type: "workout",
      source_id: SESSION_ID,
      payload: { version: 1 },
    });
    const client = makeFakeClient(state);
    const result = await findExistingWorkoutShareResult(client as never, OWNER_ID, SESSION_ID);
    assert.equal(result.status, "not_found");
  });
});

describe("publishWorkoutShareResult — the built payload never carries private/debug data", () => {
  test("the stored payload only has the documented WorkoutSharePayload fields", async () => {
    const state = baseState();
    const client = makeFakeClient(state);
    await publishWorkoutShareResult(
      client as never,
      OWNER_ID,
      basePublishInput({
        includeCoach: true,
        coach: { greeting: "כל הכבוד", paragraphs: ["פסקה"], highlights: ["שיא"] },
      }),
    );
    const stored = state.insertCalls[0]!.payload as Record<string, unknown>;
    const keys = Object.keys(stored).sort();
    assert.deepEqual(keys, [
      "bestSet",
      "caption",
      "coachFull",
      "coachSummary",
      "completedSetCount",
      "dateISO",
      "durationMinutes",
      "exercises",
      "isPartial",
      "locationLabel",
      "plannedSetCount",
      "primaryMuscleGroups",
      "totalReps",
      "totalVolumeKg",
      "version",
      "workoutName",
    ]);
  });

  test("location is absent by default and only present when explicitly enabled", async () => {
    const state = baseState();
    const client = makeFakeClient(state);
    await publishWorkoutShareResult(client as never, OWNER_ID, basePublishInput());
    assert.equal(state.insertCalls[0]!.location_label, null);

    const state2 = baseState();
    const client2 = makeFakeClient(state2);
    await publishWorkoutShareResult(
      client2 as never,
      OWNER_ID,
      basePublishInput({ locationLabel: "מכון הכושר שלי" }),
    );
    assert.equal(state2.insertCalls[0]!.location_label, "מכון הכושר שלי");
  });

  test("audience is stored exactly as chosen — public or followers", async () => {
    const state = baseState();
    const client = makeFakeClient(state);
    await publishWorkoutShareResult(
      client as never,
      OWNER_ID,
      basePublishInput({ audience: "followers" }),
    );
    assert.equal(state.insertCalls[0]!.audience, "followers");
  });
});
