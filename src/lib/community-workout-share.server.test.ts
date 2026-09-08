/**
 * Run with: node --test src/lib/community-workout-share.server.test.ts
 *
 * VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1 — server-side publish authorization
 * and idempotency, exercised against fake Supabase-shaped clients (no
 * live database; RLS itself isn't executable here — see
 * scripts/test-community-post-rls.sql for that — these tests instead prove
 * the *code* enforces ownership scoping, source-uniqueness handling, photo
 * ownership, and the server-authored coach-text source, never trusting
 * client-provided ids/text).
 *
 * The service-role "admin" client used for the actual community_posts
 * insert (Codex review finding 1) is passed in as an explicit
 * `options.adminClient` override rather than the real `supabaseAdmin`
 * singleton — same testability pattern as coach-debrief.server.ts's
 * injectable apiKey/fetchImpl.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  findExistingWorkoutShareResult,
  publishWorkoutShareResult,
} from "./community-workout-share.server.ts";
import type { PublishWorkoutShareInput } from "./community-workout-share.functions.ts";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const OWN_PHOTO_PATH = `${OWNER_ID}/44444444-4444-4444-4444-444444444444.jpg`;
const OTHER_USERS_PHOTO_PATH = `${OTHER_USER_ID}/55555555-5555-5555-5555-555555555555.jpg`;

/** A fully valid WorkoutSharePayloadV1 — passes parseWorkoutSharePayload (Codex re-review round 2, blocker 5), unlike a bare `{ version: 1 }` stub. */
const VALID_STORED_PAYLOAD = {
  version: 1,
  workoutName: "יום חזה",
  dateISO: "2026-09-08T09:00:00.000Z",
  durationMinutes: 30,
  isPartial: false,
  completedSetCount: 1,
  plannedSetCount: 1,
  totalReps: 10,
  totalVolumeKg: 400,
  bestSet: null,
  primaryMuscleGroups: [],
  exercises: [],
  coachSummary: null,
  coachFull: null,
  caption: null,
  locationLabel: null,
};

interface FakeSessionRow {
  id: string;
  user_id: string;
  name: string | null;
  started_at: string;
  duration_seconds: number | null;
  status: string;
}

interface FakeDebriefRow {
  session_id: string;
  user_id: string;
  greeting: string;
  paragraphs: string[];
  highlights: string[];
  next_focus: string | null;
  recovery: string | null;
  nutrition: string | null;
  hydration: string | null;
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
  debriefs: FakeDebriefRow[];
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

function matches(row: unknown, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([k, v]) => (row as Record<string, unknown>)[k] === v);
}

/** A tiny chainable stand-in for the subset of the Supabase query builder this module uses. */
function makeFakeClient(state: FakeState) {
  function filteredSingleQuery<T>(rows: T[]) {
    const filters: Record<string, unknown> = {};
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return api;
      },
      maybeSingle: async () => ({
        data: rows.find((r) => matches(r, filters)) ?? null,
        error: null,
      }),
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
      order: async () => ({
        data: state.sets.filter((s) => matches(s, filters)).sort((a, b) => a.position - b.position),
        error: null,
      }),
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
      maybeSingle: async () => ({
        data: state.posts.find((p) => matches(p, filters)) ?? null,
        error: null,
      }),
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
      if (table === "workout_sessions") return filteredSingleQuery(state.sessions);
      if (table === "workout_sets") return setsQuery();
      if (table === "exercises") return exercisesQuery();
      if (table === "profiles") return profilesQuery();
      if (table === "workout_debriefs") return filteredSingleQuery(state.debriefs);
      if (table === "community_posts") return postsQuery();
      throw new Error(`unexpected table in test: ${table}`);
    },
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
    debriefs: [],
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
    ...overrides,
  };
}

/** Runs publishWorkoutShareResult against the same fake state for both the RLS-scoped and admin clients. */
function publish(state: FakeState, userId: string, input: PublishWorkoutShareInput) {
  const client = makeFakeClient(state);
  const admin = makeFakeClient(state);
  return publishWorkoutShareResult(client as never, userId, input, { adminClient: admin as never });
}

describe("publishWorkoutShareResult — authorization", () => {
  test("a foreign session id (belongs to another user) is rejected as not found", async () => {
    const state = baseState();
    const result = await publish(state, OTHER_USER_ID, basePublishInput());
    assert.equal(result.status, "error");
    assert.equal((result as { reason: string }).reason, "SESSION_NOT_FOUND");
    assert.equal(state.insertCalls.length, 0, "must never insert without a real owned session");
  });

  test("a genuinely unknown session id is rejected as not found", async () => {
    const state = baseState();
    const result = await publish(
      state,
      OWNER_ID,
      basePublishInput({ sessionId: "44444444-4444-4444-4444-444444444444" }),
    );
    assert.equal(result.status, "error");
    assert.equal((result as { reason: string }).reason, "SESSION_NOT_FOUND");
  });

  test("an in-progress (not completed) session cannot be shared", async () => {
    const state = baseState();
    state.sessions[0]!.status = "in_progress";
    const result = await publish(state, OWNER_ID, basePublishInput());
    assert.equal(result.status, "error");
    assert.equal((result as { reason: string }).reason, "SESSION_NOT_COMPLETED");
  });

  test("a valid owned, completed session publishes successfully", async () => {
    const state = baseState();
    const result = await publish(state, OWNER_ID, basePublishInput());
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
    await publish(state, OWNER_ID, basePublishInput());
    assert.equal(state.insertCalls[0]!.user_id, OWNER_ID);
  });

  test("a photoPath in another user's folder is rejected, even though the admin insert would otherwise bypass RLS", async () => {
    const state = baseState();
    const result = await publish(
      state,
      OWNER_ID,
      basePublishInput({ photoPath: OTHER_USERS_PHOTO_PATH }),
    );
    assert.equal(result.status, "error");
    assert.equal(state.insertCalls.length, 0, "must never insert with a spoofed photo path");
  });

  test("a photoPath in the caller's own folder is accepted", async () => {
    const state = baseState();
    const result = await publish(state, OWNER_ID, basePublishInput({ photoPath: OWN_PHOTO_PATH }));
    assert.equal(result.status, "published");
    assert.equal(state.insertCalls[0]!.photo_path, OWN_PHOTO_PATH);
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
      payload: VALID_STORED_PAYLOAD,
    });
    const result = await publish(state, OWNER_ID, basePublishInput());
    assert.equal(result.status, "already_shared");
    assert.equal((result as { postId: string }).postId, "existing-post");
    assert.notEqual((result as { payload: unknown }).payload, null);
  });

  test("a unique-violation resolving to a row whose stored payload fails validation returns payload: null, not a raw cast (Codex re-review round 2, blocker 5)", async () => {
    const state = baseState({ insertBehavior: "unique_violation" });
    state.posts.push({
      id: "existing-post",
      user_id: OWNER_ID,
      source_type: "workout",
      source_id: SESSION_ID,
      payload: { version: 1 }, // missing every other required field
    });
    const result = await publish(state, OWNER_ID, basePublishInput());
    assert.equal(result.status, "already_shared");
    assert.equal((result as { payload: unknown }).payload, null);
  });

  test("a genuine, non-uniqueness insert failure surfaces as a safe, generic error", async () => {
    const state = baseState({ insertBehavior: "other_error" });
    const result = await publish(state, OWNER_ID, basePublishInput());
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
      payload: VALID_STORED_PAYLOAD,
    });
    const client = makeFakeClient(state);
    const result = await findExistingWorkoutShareResult(client as never, OWNER_ID, SESSION_ID);
    assert.equal(result.status, "found");
    assert.equal((result as { postId: string }).postId, "existing-post");
    assert.notEqual((result as { payload: unknown }).payload, null);
  });

  test("a found post whose stored payload fails validation returns payload: null — a safe fallback state, never a raw cast (Codex re-review round 2, blocker 5)", async () => {
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
    assert.equal((result as { payload: unknown }).payload, null);
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

describe("publishWorkoutShareResult — coach text source (Codex review findings 3+4)", () => {
  test("coach text comes from the server-authored snapshot, never from client input (there is no such input field)", async () => {
    const state = baseState({
      debriefs: [
        {
          session_id: SESSION_ID,
          user_id: OWNER_ID,
          greeting: "אימון חזק היום",
          paragraphs: ["פסקה אמיתית מהשרת"],
          highlights: ["שיא אמיתי"],
          next_focus: null,
          recovery: null,
          nutrition: null,
          hydration: null,
        },
      ],
    });
    const result = await publish(state, OWNER_ID, basePublishInput({ includeCoach: true }));
    assert.equal(result.status, "published");
    const payload = state.insertCalls[0]!.payload as { coachSummary: string | null };
    assert.match(payload.coachSummary ?? "", /אימון חזק היום/);
  });

  test("includeCoach with no persisted snapshot yields no coach section, and never blocks publishing", async () => {
    const state = baseState(); // no debriefs
    const result = await publish(state, OWNER_ID, basePublishInput({ includeCoach: true }));
    assert.equal(result.status, "published");
    const payload = state.insertCalls[0]!.payload as { coachSummary: string | null };
    assert.equal(payload.coachSummary, null);
  });

  test("another user's debrief snapshot for the same session id is never used", async () => {
    const state = baseState({
      debriefs: [
        {
          session_id: SESSION_ID,
          user_id: OTHER_USER_ID,
          greeting: "לא לך",
          paragraphs: [],
          highlights: [],
          next_focus: null,
          recovery: null,
          nutrition: null,
          hydration: null,
        },
      ],
    });
    const result = await publish(state, OWNER_ID, basePublishInput({ includeCoach: true }));
    assert.equal(result.status, "published");
    const payload = state.insertCalls[0]!.payload as { coachSummary: string | null };
    assert.equal(payload.coachSummary, null);
  });

  test("includeCoach=false never reads the snapshot into the payload, even if one exists", async () => {
    const state = baseState({
      debriefs: [
        {
          session_id: SESSION_ID,
          user_id: OWNER_ID,
          greeting: "לא צריך להופיע",
          paragraphs: [],
          highlights: [],
          next_focus: null,
          recovery: null,
          nutrition: null,
          hydration: null,
        },
      ],
    });
    const result = await publish(state, OWNER_ID, basePublishInput({ includeCoach: false }));
    assert.equal(result.status, "published");
    const payload = state.insertCalls[0]!.payload as { coachSummary: string | null };
    assert.equal(payload.coachSummary, null);
  });
});

describe("publishWorkoutShareResult — the built payload never carries private/debug data", () => {
  test("the stored payload only has the documented WorkoutSharePayload fields", async () => {
    const state = baseState({
      debriefs: [
        {
          session_id: SESSION_ID,
          user_id: OWNER_ID,
          greeting: "כל הכבוד",
          paragraphs: ["פסקה"],
          highlights: ["שיא"],
          next_focus: null,
          recovery: null,
          nutrition: null,
          hydration: null,
        },
      ],
    });
    await publish(state, OWNER_ID, basePublishInput({ includeCoach: true }));
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
    await publish(state, OWNER_ID, basePublishInput());
    assert.equal(state.insertCalls[0]!.location_label, null);

    const state2 = baseState();
    await publish(state2, OWNER_ID, basePublishInput({ locationLabel: "מכון הכושר שלי" }));
    assert.equal(state2.insertCalls[0]!.location_label, "מכון הכושר שלי");
  });

  test("audience is stored exactly as chosen — public or followers", async () => {
    const state = baseState();
    await publish(state, OWNER_ID, basePublishInput({ audience: "followers" }));
    assert.equal(state.insertCalls[0]!.audience, "followers");
  });
});
