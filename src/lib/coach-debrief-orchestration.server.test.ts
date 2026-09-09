/**
 * Run with: node --test src/lib/coach-debrief-orchestration.server.test.ts
 *
 * Codex re-review round 3, F1+F2 (VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1):
 * an integration-style test of the REAL generateCoachDebrief path
 * (runGenerateCoachDebrief), not just the isolated units it's built from.
 * Proves:
 *  - the client-facing input is sessionId alone (the fake authClient here
 *    never receives anything else; ownership is derived entirely from
 *    the session row + the caller's own userId).
 *  - ownership is verified BEFORE the admin client (or the debrief
 *    generator) is ever touched.
 *  - a foreign/unknown session calls neither the generator nor any write.
 *  - a successful debrief is persisted via the ADMIN client, never the
 *    caller's own authClient — the authClient fake below has no
 *    workout_debriefs handler at all, so a write attempted through it
 *    throws "unexpected table", the same regression this test guards
 *    against (Codex found the code writing through context.supabase,
 *    which workout_debriefs' round-2 RLS makes read-only for
 *    `authenticated`).
 *  - a snapshot write failure never fails the overall debrief response.
 *  - the same row the admin client wrote is exactly what
 *    loadWorkoutDebriefSnapshot reads back — Share Studio gets it
 *    without any further AI call.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  runGenerateCoachDebrief,
  runGetWorkoutDebriefSnapshot,
} from "./coach-debrief-orchestration.server.ts";
import { loadWorkoutDebriefSnapshot } from "./coach-debrief-persistence.server.ts";
import type { CoachDebrief } from "./coach-debrief.functions";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";
const UNKNOWN_SESSION_ID = "44444444-4444-4444-4444-444444444444";

/** Throws the instant any query is attempted — for proving malformed input never reaches the DB at all (Codex re-review round 4, F2), not just that the query returns nothing. */
function makeUntouchableClient() {
  return {
    from(table: string) {
      throw new Error(
        `DB was touched for table "${table}" — this must never happen for malformed input`,
      );
    },
  };
}

function matches(row: unknown, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([k, v]) => (row as Record<string, unknown>)[k] === v);
}

/** Minimal fake for the tables buildVerifiedDebriefContext reads — enough for a valid, ownable session with zero sets/plan/profile data (that math is already covered by coach-debrief-context.server.test.ts; this file is about the orchestration around it). */
function makeAuthClient() {
  const sessions = [{ id: SESSION_ID, user_id: OWNER_ID, name: "יום רגליים", status: "completed" }];
  function query(rows: unknown[]) {
    const filters: Record<string, unknown> = {};
    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return api;
      },
      in: () => api,
      not: () => api,
      neq: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: async () => ({
        data: rows.find((r) => matches(r, filters)) ?? null,
        error: null,
      }),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: rows.filter((r) => matches(r, filters)), error: null }),
    };
    return api;
  }
  return {
    from(table: string) {
      if (table === "workout_sessions") return query(sessions);
      if (table === "workout_sets") return query([]);
      if (table === "exercises") return query([]);
      if (table === "workout_plans") return query([]);
      if (table === "profiles") return query([]);
      // No workout_debriefs handler on purpose — a write attempted
      // through this client (the F1 bug) must fail loudly, not silently.
      throw new Error(`unexpected table on authClient: ${table}`);
    },
  };
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

function makeAdminClient(
  state: { rows: FakeDebriefRow[]; upsertCalls: unknown[] },
  failWrite = false,
) {
  return {
    from(table: string) {
      if (table !== "workout_debriefs") {
        throw new Error(`unexpected table on adminClient: ${table}`);
      }
      return {
        upsert: async (values: FakeDebriefRow) => {
          state.upsertCalls.push(values);
          if (failWrite) {
            return { data: null, error: { code: "42501", message: "simulated write failure" } };
          }
          state.rows = state.rows.filter((r) => r.session_id !== values.session_id);
          state.rows.push(values);
          return { data: null, error: null };
        },
        select: () => ({
          eq: (col: string, val: unknown) => ({
            eq: (col2: string, val2: unknown) => ({
              maybeSingle: async () => ({
                data:
                  state.rows.find((r) => matches(r, { [col]: val, [col2]: val2 } as never)) ?? null,
                error: null,
              }),
            }),
          }),
        }),
      };
    },
  };
}

const SAMPLE_DEBRIEF: CoachDebrief = {
  greeting: "כל הכבוד על האימון",
  paragraphs: ["פסקה אמיתית"],
  highlights: ["שיא אמיתי"],
  nextFocus: null,
  recovery: null,
  nutrition: null,
  hydration: null,
};

describe("runGenerateCoachDebrief — the real end-to-end path (Codex re-review round 3, F1+F2)", () => {
  test("a valid owned session: generator is called once with the rebuilt context, and the snapshot is written via the admin client", async () => {
    const authClient = makeAuthClient();
    const adminState = { rows: [], upsertCalls: [] };
    const adminClient = makeAdminClient(adminState);
    let generateCallCount = 0;

    const result = await runGenerateCoachDebrief(authClient as never, OWNER_ID, SESSION_ID, {
      adminClient: adminClient as never,
      generateDebrief: async (ctx) => {
        generateCallCount++;
        assert.equal(
          ctx.workoutName,
          "יום רגליים",
          "the generator receives the server-rebuilt context",
        );
        return { status: "ok", debrief: SAMPLE_DEBRIEF };
      },
    });

    assert.equal(result.status, "ok");
    assert.equal(generateCallCount, 1);
    assert.equal(adminState.upsertCalls.length, 1, "the write must go through the admin client");
    assert.equal((adminState.upsertCalls[0] as FakeDebriefRow).session_id, SESSION_ID);
    assert.equal((adminState.upsertCalls[0] as FakeDebriefRow).user_id, OWNER_ID);
    assert.equal((adminState.upsertCalls[0] as FakeDebriefRow).greeting, SAMPLE_DEBRIEF.greeting);
  });

  test("a foreign session (belongs to another user) never calls the generator and never writes", async () => {
    const authClient = makeAuthClient();
    const adminState = { rows: [], upsertCalls: [] };
    const adminClient = makeAdminClient(adminState);
    let generateCallCount = 0;

    const result = await runGenerateCoachDebrief(authClient as never, OTHER_USER_ID, SESSION_ID, {
      adminClient: adminClient as never,
      generateDebrief: async () => {
        generateCallCount++;
        return { status: "ok", debrief: SAMPLE_DEBRIEF };
      },
    });

    assert.equal(result.status, "error");
    assert.equal(
      generateCallCount,
      0,
      "no AI call for a session that isn't provably the caller's own",
    );
    assert.equal(
      adminState.upsertCalls.length,
      0,
      "no write for a session that isn't provably owned",
    );
  });

  test("an unknown session id never calls the generator and never writes", async () => {
    const authClient = makeAuthClient();
    const adminState = { rows: [], upsertCalls: [] };
    const adminClient = makeAdminClient(adminState);
    let generateCallCount = 0;

    const result = await runGenerateCoachDebrief(
      authClient as never,
      OWNER_ID,
      UNKNOWN_SESSION_ID,
      {
        adminClient: adminClient as never,
        generateDebrief: async () => {
          generateCallCount++;
          return { status: "ok", debrief: SAMPLE_DEBRIEF };
        },
      },
    );

    assert.equal(result.status, "error");
    assert.equal(generateCallCount, 0);
    assert.equal(adminState.upsertCalls.length, 0);
  });

  test("a snapshot write failure never fails the overall debrief response — the caller still gets the generated debrief", async () => {
    const authClient = makeAuthClient();
    const adminState = { rows: [], upsertCalls: [] };
    const adminClient = makeAdminClient(adminState, /* failWrite */ true);

    const result = await runGenerateCoachDebrief(authClient as never, OWNER_ID, SESSION_ID, {
      adminClient: adminClient as never,
      generateDebrief: async () => ({ status: "ok", debrief: SAMPLE_DEBRIEF }),
    });

    assert.equal(result.status, "ok");
    assert.equal((result as { debrief: CoachDebrief }).debrief.greeting, SAMPLE_DEBRIEF.greeting);
    assert.equal(adminState.upsertCalls.length, 1, "a write was attempted");
    assert.equal(adminState.rows.length, 0, "the attempted write did not actually persist");
  });

  test("a generator failure never attempts a write at all", async () => {
    const authClient = makeAuthClient();
    const adminState = { rows: [], upsertCalls: [] };
    const adminClient = makeAdminClient(adminState);

    const result = await runGenerateCoachDebrief(authClient as never, OWNER_ID, SESSION_ID, {
      adminClient: adminClient as never,
      generateDebrief: async () => ({
        status: "error",
        category: "PROVIDER_UNAVAILABLE",
        message: "שירות ה-AI אינו זמין כרגע — נסה שוב בעוד רגע.",
        correlationId: "dbg_test",
      }),
    });

    assert.equal(result.status, "error");
    assert.equal(adminState.upsertCalls.length, 0);
  });

  test("the exact row the admin client wrote is what loadWorkoutDebriefSnapshot reads back — Share Studio needs no further AI call", async () => {
    const authClient = makeAuthClient();
    const adminState = { rows: [], upsertCalls: [] };
    const adminClient = makeAdminClient(adminState);

    await runGenerateCoachDebrief(authClient as never, OWNER_ID, SESSION_ID, {
      adminClient: adminClient as never,
      generateDebrief: async () => ({ status: "ok", debrief: SAMPLE_DEBRIEF }),
    });

    // Read back through the SAME table the admin client just wrote —
    // proves the write and the read agree on shape, with no AI call in
    // this second step at all (loadWorkoutDebriefSnapshot never touches
    // a generator).
    const loaded = await loadWorkoutDebriefSnapshot(adminClient as never, OWNER_ID, SESSION_ID);
    assert.notEqual(loaded, null);
    assert.equal(loaded!.greeting, SAMPLE_DEBRIEF.greeting);
    assert.deepEqual(loaded!.paragraphs, SAMPLE_DEBRIEF.paragraphs);
    assert.deepEqual(loaded!.highlights, SAMPLE_DEBRIEF.highlights);
  });

  test("a malformed sessionId never reaches the DB at all — the auth client is never touched (Codex re-review round 4, F2)", async () => {
    const untouchable = makeUntouchableClient();
    let generateCallCount = 0;

    const malformedIds = [
      "",
      "not-a-uuid",
      "  ",
      "11111111-1111-1111-1111-11111111111",
      "'; drop table workout_sessions; --",
    ];
    for (const malformed of malformedIds) {
      const result = await runGenerateCoachDebrief(untouchable as never, OWNER_ID, malformed, {
        generateDebrief: async () => {
          generateCallCount++;
          return { status: "ok", debrief: SAMPLE_DEBRIEF };
        },
      });
      assert.equal(
        result.status,
        "error",
        `expected an error for malformed sessionId "${malformed}"`,
      );
    }
    assert.equal(generateCallCount, 0, "no AI call for any malformed sessionId");
  });
});

describe("runGetWorkoutDebriefSnapshot — the real end-to-end read path (Codex re-review round 4, F2)", () => {
  test("a well-formed, owned session id is found", async () => {
    const state = { rows: [], upsertCalls: [] };
    const adminClient = makeAdminClient(state);
    await runGenerateCoachDebrief(makeAuthClient() as never, OWNER_ID, SESSION_ID, {
      adminClient: adminClient as never,
      generateDebrief: async () => ({ status: "ok", debrief: SAMPLE_DEBRIEF }),
    });

    const result = await runGetWorkoutDebriefSnapshot(adminClient as never, OWNER_ID, SESSION_ID);
    assert.equal(result.status, "found");
    assert.equal((result as { debrief: CoachDebrief }).debrief.greeting, SAMPLE_DEBRIEF.greeting);
  });

  test("a genuinely unknown but well-formed session id resolves to not_found", async () => {
    const adminClient = makeAdminClient({ rows: [], upsertCalls: [] });
    const result = await runGetWorkoutDebriefSnapshot(
      adminClient as never,
      OWNER_ID,
      UNKNOWN_SESSION_ID,
    );
    assert.equal(result.status, "not_found");
  });

  test("a malformed sessionId resolves to not_found and never touches the DB at all", async () => {
    const untouchable = makeUntouchableClient();
    const malformedIds = [
      "",
      "not-a-uuid",
      "  ",
      "11111111-1111-1111-1111-11111111111",
      "'; drop table workout_debriefs; --",
    ];
    for (const malformed of malformedIds) {
      const result = await runGetWorkoutDebriefSnapshot(untouchable as never, OWNER_ID, malformed);
      assert.equal(
        result.status,
        "not_found",
        `expected not_found for malformed sessionId "${malformed}"`,
      );
    }
  });
});
