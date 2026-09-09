/**
 * Run with: node --test src/lib/coach-debrief-context.server.test.ts
 *
 * Codex re-review round 2, blockers 2+3 (VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1):
 * buildVerifiedDebriefContext must rebuild the entire Coach Debrief context
 * from sessionId + the caller's own verified identity, never from a
 * client-supplied blob — and must never leak another user's sessions,
 * sets, or PR history into it. Exercised against a fake Supabase-shaped
 * client (same pattern as community-workout-share.server.test.ts).
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildVerifiedDebriefContext } from "./coach-debrief-context.server.ts";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const OTHER_SESSION_ID = "66666666-6666-6666-6666-666666666666";

interface FakeSessionRow {
  id: string;
  user_id: string;
  name: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  total_volume_kg: number | null;
  difficulty: number | null;
  energy: number | null;
  pain: string | null;
  notes: string | null;
}

interface FakeSetRow {
  session_id: string;
  user_id: string;
  exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  completed_at: string | null;
  actual_rest_seconds: number | null;
  planned_rest_seconds: number | null;
  position: number;
}

interface FakeState {
  sessions: FakeSessionRow[];
  sets: FakeSetRow[];
  exercises: Array<{ id: string; name: string }>;
  plans: Array<{
    user_id: string;
    weekday: number;
    template_id: string | null;
    display_name: string | null;
  }>;
  profiles: Array<{ id: string; first_name: string | null }>;
}

/** A tiny chainable, directly-awaitable stand-in for the subset of the Supabase query builder this module uses — every filter method both mutates state and returns `api`, and `api` is itself thenable, so a chain can be awaited after any call (matching exactly where each real query in coach-debrief-context.server.ts stops chaining). */
function makeQuery<T extends Record<string, unknown>>(rows: T[]) {
  const eqFilters: Record<string, unknown> = {};
  const neqFilters: Record<string, unknown> = {};
  const inFilters: Record<string, unknown[]> = {};
  let notNullCol: string | null = null;
  let sortCol: string | null = null;
  let sortAsc = true;
  let limitN: number | null = null;

  function apply(): T[] {
    let out = rows.filter((r) => Object.entries(eqFilters).every(([k, v]) => r[k] === v));
    out = out.filter((r) => Object.entries(neqFilters).every(([k, v]) => r[k] !== v));
    out = out.filter((r) => Object.entries(inFilters).every(([k, vals]) => vals.includes(r[k])));
    if (notNullCol) out = out.filter((r) => r[notNullCol as string] != null);
    if (sortCol) {
      const col = sortCol;
      out = [...out].sort((a, b) => {
        const av = a[col] as string | number;
        const bv = b[col] as string | number;
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (sortAsc ? 1 : -1);
      });
    }
    if (limitN != null) out = out.slice(0, limitN);
    return out;
  }

  const api = {
    select: () => api,
    eq: (col: string, val: unknown) => {
      eqFilters[col] = val;
      return api;
    },
    neq: (col: string, val: unknown) => {
      neqFilters[col] = val;
      return api;
    },
    in: (col: string, vals: unknown[]) => {
      inFilters[col] = vals;
      return api;
    },
    not: (col: string) => {
      notNullCol = col;
      return api;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      sortCol = col;
      sortAsc = opts?.ascending !== false;
      return api;
    },
    limit: (n: number) => {
      limitN = n;
      return api;
    },
    maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
    then: (resolve: (v: { data: T[]; error: null }) => void) =>
      resolve({ data: apply(), error: null }),
  };
  return api;
}

function makeFakeClient(state: FakeState) {
  return {
    from(table: string) {
      if (table === "workout_sessions") return makeQuery(state.sessions as never);
      if (table === "workout_sets") return makeQuery(state.sets as never);
      if (table === "exercises") return makeQuery(state.exercises as never);
      if (table === "workout_plans") return makeQuery(state.plans as never);
      if (table === "profiles") return makeQuery(state.profiles as never);
      throw new Error(`unexpected table in test: ${table}`);
    },
  };
}

/** A fake client where every query against `failTable` resolves `{ error }` — for proving a DB failure mid-context-build is caught, not thrown (Codex re-review round 3, F4). `error` is injectable (round 4, F1) so a test can plant a sentinel and prove it never reaches a log. */
function makeFailingClient(
  state: FakeState,
  failTable: string,
  error: { code: string; message: string } = { code: "08006", message: "simulated DB failure" },
) {
  const real = makeFakeClient(state);
  const failingApi = {
    select: () => failingApi,
    eq: () => failingApi,
    neq: () => failingApi,
    in: () => failingApi,
    not: () => failingApi,
    order: () => failingApi,
    limit: () => failingApi,
    maybeSingle: async () => ({ data: null, error }),
    then: (resolve: (v: { data: null; error: typeof error }) => void) =>
      resolve({ data: null, error }),
  };
  return {
    from(table: string) {
      return table === failTable ? failingApi : real.from(table);
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
        status: "completed",
        started_at: "2026-09-08T09:00:00.000Z",
        finished_at: "2026-09-08T09:45:00.000Z",
        duration_seconds: 2700,
        total_volume_kg: 800,
        difficulty: 7,
        energy: 6,
        pain: "none",
        notes: "הרגשתי חזק",
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
        completed_at: "2026-09-08T09:10:00.000Z",
        actual_rest_seconds: 90,
        planned_rest_seconds: 90,
        position: 1,
      },
      {
        session_id: SESSION_ID,
        user_id: OWNER_ID,
        exercise_id: "ex-1",
        set_number: 2,
        weight_kg: null,
        reps: null,
        completed_at: null,
        actual_rest_seconds: null,
        planned_rest_seconds: 90,
        position: 2,
      },
    ],
    exercises: [{ id: "ex-1", name: "לחיצת חזה" }],
    plans: [],
    profiles: [{ id: OWNER_ID, first_name: "קובי" }],
    ...overrides,
  };
}

describe("buildVerifiedDebriefContext — ownership (Codex re-review round 2, blockers 2+3)", () => {
  test("returns null for a genuinely unknown session id", async () => {
    const client = makeFakeClient(baseState());
    const ctx = await buildVerifiedDebriefContext(client as never, OWNER_ID, OTHER_SESSION_ID);
    assert.equal(ctx, null);
  });

  test("returns null for a session that belongs to another user — never falls back to any data", async () => {
    const client = makeFakeClient(baseState());
    const ctx = await buildVerifiedDebriefContext(client as never, OTHER_USER_ID, SESSION_ID);
    assert.equal(ctx, null);
  });

  test("a valid, owned session builds a full context with no client input at all", async () => {
    const client = makeFakeClient(baseState());
    const ctx = await buildVerifiedDebriefContext(client as never, OWNER_ID, SESSION_ID);
    assert.notEqual(ctx, null);
    assert.equal(ctx!.workoutName, "יום חזה");
    assert.equal(ctx!.plannedSets, 2);
    assert.equal(ctx!.completedSets, 1);
    assert.equal(ctx!.skippedSets, 1);
    assert.equal(ctx!.totalVolumeKg, 400);
    assert.equal(ctx!.completionRatePct, 50);
    assert.equal(ctx!.durationMinutes, 45);
  });

  test("session-level self-report fields (difficulty/energy/pain/notes) come from the persisted session row, not any client input", async () => {
    const client = makeFakeClient(baseState());
    const ctx = await buildVerifiedDebriefContext(client as never, OWNER_ID, SESSION_ID);
    assert.equal(ctx!.difficulty, 7);
    assert.equal(ctx!.energy, 6);
    assert.equal(ctx!.pain, "none");
    assert.equal(ctx!.notes, "הרגשתי חזק");
  });

  test("another user's sets for the same exercise never contribute to this session's per-exercise stats or PR baseline", async () => {
    // A genuine prior best of the OWNER's own (35kg) alongside a much
    // larger foreign user's set (999kg) for the same exercise — proves the
    // foreign set is excluded rather than merely absent (prevBestKg would
    // still read null with no rows at all, which wouldn't distinguish
    // "correctly filtered out" from "coincidentally never queried").
    const state = baseState({
      sets: [
        ...baseState().sets,
        {
          session_id: "owners-prior-session",
          user_id: OWNER_ID,
          exercise_id: "ex-1",
          set_number: 1,
          weight_kg: 35,
          reps: 8,
          completed_at: "2026-09-01T09:00:00.000Z",
          actual_rest_seconds: null,
          planned_rest_seconds: null,
          position: 1,
        },
        {
          session_id: "someone-elses-session",
          user_id: OTHER_USER_ID,
          exercise_id: "ex-1",
          set_number: 1,
          weight_kg: 999,
          reps: 1,
          completed_at: "2026-09-01T09:00:00.000Z",
          actual_rest_seconds: null,
          planned_rest_seconds: null,
          position: 1,
        },
      ],
    });
    const client = makeFakeClient(state);
    const ctx = await buildVerifiedDebriefContext(client as never, OWNER_ID, SESSION_ID);
    const exercise = ctx!.exercises.find((e) => e.name === "לחיצת חזה");
    assert.equal(
      exercise!.prevBestKg,
      35,
      "another user's 999kg set must not become this user's PR baseline",
    );
  });

  test("a prior completed session's set for the same exercise becomes the PR baseline; the current session's own sets never count as their own baseline", async () => {
    // Relative to actual Date.now() (not a hardcoded past date) — countSince
    // filters on the real wall clock, so a fixed literal date would make
    // this test's "within the last 7 days" assertion time-dependent/flaky.
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    const state = baseState({
      sessions: [
        ...baseState().sessions,
        {
          id: "prior-session",
          user_id: OWNER_ID,
          name: "יום חזה קודם",
          status: "completed",
          started_at: twoDaysAgo,
          finished_at: twoDaysAgo,
          duration_seconds: 2400,
          total_volume_kg: 300,
          difficulty: null,
          energy: null,
          pain: null,
          notes: null,
        },
      ],
      sets: [
        ...baseState().sets,
        {
          session_id: "prior-session",
          user_id: OWNER_ID,
          exercise_id: "ex-1",
          set_number: 1,
          weight_kg: 35,
          reps: 8,
          completed_at: twoDaysAgo,
          actual_rest_seconds: null,
          planned_rest_seconds: null,
          position: 1,
        },
      ],
    });
    const client = makeFakeClient(state);
    const ctx = await buildVerifiedDebriefContext(client as never, OWNER_ID, SESSION_ID);
    const exercise = ctx!.exercises.find((e) => e.name === "לחיצת חזה");
    assert.equal(exercise!.prevBestKg, 35);
    assert.equal(exercise!.isPR, true, "40kg today beats the 35kg prior best");
    assert.equal(ctx!.prevVolumeKg, 300);
    assert.equal(ctx!.workoutsLast7Days, 1);
  });

  test("displayName is read from the caller's own profile row, defaulting to empty string when absent", async () => {
    const client = makeFakeClient(baseState());
    const ctx = await buildVerifiedDebriefContext(client as never, OWNER_ID, SESSION_ID);
    assert.equal(ctx!.displayName, "קובי");

    const stateNoProfile = baseState({ profiles: [] });
    const client2 = makeFakeClient(stateNoProfile);
    const ctx2 = await buildVerifiedDebriefContext(client2 as never, OWNER_ID, SESSION_ID);
    assert.equal(ctx2!.displayName, "");
  });

  test("another user's weekly plan slots never leak into nextWorkoutName", async () => {
    const state = baseState({
      plans: [{ user_id: OTHER_USER_ID, weekday: 0, template_id: "t1", display_name: "לא לי" }],
    });
    const client = makeFakeClient(state);
    const ctx = await buildVerifiedDebriefContext(client as never, OWNER_ID, SESSION_ID);
    assert.equal(ctx!.nextWorkoutName, null);
  });

  test("a DB failure while building the context (Codex re-review round 3, F4) resolves to null, never throws", async () => {
    const client = makeFailingClient(baseState(), "workout_sets");
    await assert.doesNotReject(buildVerifiedDebriefContext(client as never, OWNER_ID, SESSION_ID));
    const ctx = await buildVerifiedDebriefContext(client as never, OWNER_ID, SESSION_ID);
    assert.equal(ctx, null);
  });

  test("a DB failure on a later query (exercise names) is also caught, never thrown", async () => {
    const client = makeFailingClient(baseState(), "exercises");
    const ctx = await buildVerifiedDebriefContext(client as never, OWNER_ID, SESSION_ID);
    assert.equal(ctx, null);
  });

  // workout_plans and profiles failures are deliberately NOT included above:
  // loadWeeklyPlan already degrades locally (.catch(() => [])) since
  // nextWorkoutName is non-essential, and loadDisplayName never throws at
  // all (ignores its own error, same convention as
  // community-workout-share.server.ts's loadAuthorDisplayName) — both are
  // intentional graceful degradation, not something this test should turn
  // into a hard failure.
  test("a weekly-plan query failure degrades gracefully (nextWorkoutName: null) rather than nulling the whole context", async () => {
    const client = makeFailingClient(baseState(), "workout_plans");
    const ctx = await buildVerifiedDebriefContext(client as never, OWNER_ID, SESSION_ID);
    assert.notEqual(ctx, null);
    assert.equal(ctx!.nextWorkoutName, null);
  });

  test("no raw error data reaches the log on a context-build failure (Codex re-review round 4, F1)", async () => {
    const sentinel = "SHOULD_NEVER_APPEAR_SECRET";
    const injectedError = { code: sentinel, message: `leaked details: ${sentinel}` };
    const client = makeFailingClient(baseState(), "workout_sets", injectedError);

    const originalConsoleError = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };
    let ctx: unknown;
    try {
      ctx = await buildVerifiedDebriefContext(client as never, OWNER_ID, SESSION_ID);
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(ctx, null);
    assert.ok(calls.length > 0, "expected the failure to be logged at least once");
    const serialized = JSON.stringify(calls);
    assert.ok(!serialized.includes(sentinel), "the sentinel must never reach the log");
    assert.ok(
      !serialized.includes(injectedError.message),
      "the raw error message must never reach the log",
    );
    assert.ok(!serialized.includes(SESSION_ID), "sessionId must never reach the log");
    assert.ok(!serialized.includes(OWNER_ID), "userId must never reach the log");
  });
});
