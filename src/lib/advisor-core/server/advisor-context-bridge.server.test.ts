/**
 * Run with: node --test src/lib/advisor-core/server/advisor-context-bridge.server.test.ts
 *
 * VIORA-P0-MOBILE-RUNTIME-RECOVERY-CLAUDE-001 — Incident B (all four advisor
 * chats failing to load with "לא הצלחנו לטעון את השיחות").
 *
 * Root cause: `createSupabaseAdvisorContextDataSource().load()` fired 16
 * parallel Supabase queries to build the personal-context snapshot as part
 * of the *initial* conversation/messages load (not just on send), and threw
 * `ADVISOR_CONTEXT_UNAVAILABLE` the moment ANY single one of them returned
 * an error — including the newly-added `health_metrics` query, whose table
 * appears to not exist yet on the live project (see PR description). That
 * exception propagated up through `getAdvisorConversationMessagesServer`'s
 * generic catch as `PERSISTENCE_UNAVAILABLE`, which the UI renders as
 * "couldn't load conversations" and disables the composer — for every
 * advisor, on every retry, since the failure is deterministic. It was never
 * an OpenAI/billing problem: this whole path runs before any provider call.
 *
 * These tests exercise the REAL `buildAdvisorContextForUser` and
 * `createSupabaseAdvisorContextDataSource` against a fake Supabase client,
 * proving the fix: a failing optional source degrades instead of throwing.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildAdvisorContextForUser,
  createSupabaseAdvisorContextDataSource,
  safeConversationContextFlags,
} from "./advisor-context-bridge.server.ts";
import type { ContextAdvisorId } from "../../advisor-context-snapshot.ts";
import type { AdvisorContextDataSource } from "./advisor-context-bridge.server.ts";

type FakeResult = { data: unknown; error: { message: string; code?: string } | null };

/**
 * A minimal fake of the Supabase query-builder chain. Every chain method
 * (select/eq/gte/lte/or/order/limit/in/maybeSingle/...) returns the same
 * thenable, so `await supabase.from(table)....maybeSingle()` resolves to
 * whatever result was configured for `table`, regardless of which methods
 * were chained along the way.
 */
function fakeChain(result: FakeResult) {
  const handler: ProxyHandler<() => void> = {
    get(_target, prop) {
      if (prop === "then") return (resolve: (value: FakeResult) => void) => resolve(result);
      return (..._args: unknown[]) => proxy;
    },
  };
  const proxy = new Proxy(() => {}, handler);
  return proxy;
}

const ok = (data: unknown): FakeResult => ({ data, error: null });
const fail = (message: string, code?: string): FakeResult => ({
  data: null,
  error: { message, code },
});

function baselineResponses(): Record<string, FakeResult> {
  return {
    advisor_context_preferences: ok({ context_sharing_enabled: true }),
    profiles: ok({
      display_name: "Kobi",
      gender: "male",
      birth_date: "1990-01-01",
      height_cm: 180,
      current_weight_kg: 80,
    }),
    goals: ok([{ title: "Get stronger" }]),
    bio_days: ok(null),
    shift_config: ok(null),
    bio_day_event_assignments: ok([]),
    nutrition_entries: ok([]),
    daily_events: ok([]),
    workout_instances: ok([]),
    workout_sessions: ok([]),
    workouts: ok([]),
    health_logs: ok([]),
    medical_issues: ok([]),
    weights_history: ok([]),
    body_measurements: ok([]),
    vision_captures: ok([]),
    health_metrics: ok([]),
  };
}

function fakeSupabase(responses: Record<string, FakeResult>) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      return fakeChain(responses[table] ?? ok(null));
    },
  };
  return { client, calls };
}

const ACTIVE_ADVISORS: ContextAdvisorId[] = ["adam", "daniel", "maya", "shiran"];

describe("hasConsent — fail closed instead of throwing", () => {
  test("consent on: returns true and does not warn", async () => {
    const { client } = fakeSupabase(baselineResponses());
    const source = createSupabaseAdvisorContextDataSource(client as never);
    assert.equal(await source.hasConsent("user-1"), true);
  });

  test("consent off: returns false", async () => {
    const responses = {
      ...baselineResponses(),
      advisor_context_preferences: ok({ context_sharing_enabled: false }),
    };
    const { client } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);
    assert.equal(await source.hasConsent("user-1"), false);
  });

  test("consent never set (no row): returns false, same as explicitly off", async () => {
    const responses = { ...baselineResponses(), advisor_context_preferences: ok(null) };
    const { client } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);
    assert.equal(await source.hasConsent("user-1"), false);
  });

  test("consent check query fails: fails CLOSED (false), never throws — this used to throw ADVISOR_CONTEXT_CONSENT_UNAVAILABLE and break the whole conversation load", async () => {
    const responses = {
      ...baselineResponses(),
      advisor_context_preferences: fail(
        'password authentication failed for user "supabase_admin"',
        "28P01",
      ),
    };
    const { client } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);
    await assert.doesNotReject(async () => {
      assert.equal(await source.hasConsent("user-1"), false);
    });
  });

  test("consent check failure logs only a sanitized error code, never the raw PostgREST message", async () => {
    const originalWarn = console.warn;
    const warnCalls: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };
    try {
      const sensitiveMessage = 'password authentication failed for user "supabase_admin"';
      const responses = {
        ...baselineResponses(),
        advisor_context_preferences: fail(sensitiveMessage, "28P01"),
      };
      const { client } = fakeSupabase(responses);
      const source = createSupabaseAdvisorContextDataSource(client as never);
      await source.hasConsent("user-1");

      const relevant = warnCalls.filter(
        (args) => typeof args[0] === "string" && args[0].includes("consent check failed"),
      );
      assert.equal(relevant.length, 1);
      const [, details] = relevant[0]!;
      assert.deepEqual(details, { errorCode: "28P01" });
      assert.doesNotMatch(
        JSON.stringify(warnCalls),
        /password authentication failed|supabase_admin/,
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});

describe("buildAdvisorContextForUser — consent gate short-circuits before any query", () => {
  test("consent off: load() is never called — no wasted/unsafe queries", async () => {
    const responses = {
      ...baselineResponses(),
      advisor_context_preferences: ok({ context_sharing_enabled: false }),
    };
    const { client, calls } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);
    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    assert.deepEqual(result.context.facts, {});
    assert.deepEqual(result.contextFlags, [{ key: "contextSharing", state: "disabled" }]);
    assert.deepEqual(
      calls,
      ["advisor_context_preferences"],
      "only the consent check ran, nothing else was queried",
    );
  });

  test("consent revoked between calls: each call reflects its own current state, nothing is cached/stale", async () => {
    const grantedSource = createSupabaseAdvisorContextDataSource(
      fakeSupabase(baselineResponses()).client as never,
    );
    const first = await buildAdvisorContextForUser("user-1", "adam", grantedSource);
    assert.notDeepEqual(first.context.facts, {}, "context sharing was on: real facts came back");

    const revokedResponses = {
      ...baselineResponses(),
      advisor_context_preferences: ok({ context_sharing_enabled: false }),
    };
    const revokedSource = createSupabaseAdvisorContextDataSource(
      fakeSupabase(revokedResponses).client as never,
    );
    const second = await buildAdvisorContextForUser("user-1", "adam", revokedSource);
    assert.deepEqual(
      second.context.facts,
      {},
      "immediately after revocation, no personal facts are returned",
    );
    assert.deepEqual(second.contextFlags, [{ key: "contextSharing", state: "disabled" }]);
  });
});

describe("buildAdvisorContextForUser — a failing optional source degrades instead of blocking everything", () => {
  test("health_metrics query fails (the actual production bug): does not throw, other facts still load", async () => {
    const responses = {
      ...baselineResponses(),
      health_metrics: fail('relation "health_metrics" does not exist', "42P01"),
    };
    const { client } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);

    await assert.doesNotReject(async () => {
      const result = await buildAdvisorContextForUser("user-1", "adam", source);
      assert.equal(result.context.facts.profile?.state, "known", "profile still loaded fine");
      // healthMetrics itself becomes an all-null summary, not a thrown error —
      // buildAdvisorContextSnapshot's fact() helper turns that into "missing".
      assert.ok(
        ["missing", undefined].includes(result.context.facts.healthMetrics?.state),
        "healthMetrics degrades to missing instead of taking the whole snapshot down",
      );
    });
  });

  test("vision_captures (blood test) query fails: does not throw, other facts still load", async () => {
    const responses = { ...baselineResponses(), vision_captures: fail("statement timeout") };
    const { client } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);
    await assert.doesNotReject(() => buildAdvisorContextForUser("user-1", "adam", source));
  });

  test("multiple sources fail at once: still does not throw", async () => {
    const responses = {
      ...baselineResponses(),
      health_metrics: fail("relation does not exist"),
      workout_sessions: fail("timeout"),
      medical_issues: fail("permission denied"),
    };
    const { client } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);
    await assert.doesNotReject(() => buildAdvisorContextForUser("user-1", "adam", source));
  });

  test("missing personal context: no profile row yet — degrades to a missing profile fact, not a throw", async () => {
    const responses = { ...baselineResponses(), profiles: ok(null) };
    const { client } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);
    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    assert.equal(result.context.facts.profile?.state, "missing");
  });

  test("transient failure then retry succeeds: the same call that used to hard-fail now succeeds immediately, and succeeds again once the source recovers", async () => {
    const brokenResponses = {
      ...baselineResponses(),
      health_metrics: fail("relation does not exist"),
    };
    const brokenSource = createSupabaseAdvisorContextDataSource(
      fakeSupabase(brokenResponses).client as never,
    );
    const firstAttempt = await buildAdvisorContextForUser("user-1", "adam", brokenSource);
    assert.equal(
      firstAttempt.context.facts.profile?.state,
      "known",
      "already succeeds on the first attempt, degraded",
    );

    const recoveredResponses = {
      ...baselineResponses(),
      health_metrics: ok([
        {
          metric_type: "heart_rate_resting",
          value: 58,
          unit: "bpm",
          recorded_at: "2026-09-06T08:00:00.000Z",
        },
      ]),
    };
    const recoveredSource = createSupabaseAdvisorContextDataSource(
      fakeSupabase(recoveredResponses).client as never,
    );
    const retry = await buildAdvisorContextForUser("user-1", "adam", recoveredSource);
    assert.equal(
      retry.context.facts.healthMetrics?.state,
      "known",
      "once the source recovers, real data comes through",
    );
  });
});

describe("buildAdvisorContextForUser — all four advisors load, even with a broken wearable source", () => {
  for (const advisorId of ACTIVE_ADVISORS) {
    test(`${advisorId} builds context without throwing`, async () => {
      const responses = { ...baselineResponses(), health_metrics: fail("relation does not exist") };
      const { client } = fakeSupabase(responses);
      const source = createSupabaseAdvisorContextDataSource(client as never);
      await assert.doesNotReject(async () => {
        const result = await buildAdvisorContextForUser("user-1", advisorId, source);
        assert.equal(result.context.facts.profile?.state, "known");
      });
    });
  }
});

describe('partial degradation must say contextSharing:"limited" — never look like full sharing', () => {
  // VIORA-P0-MOBILE-RUNTIME-RECOVERY-REVIEW-FIXES-001 blocker: a source that
  // silently failed must not be indistinguishable from a source that simply
  // had no data. The UI must be told sharing is limited, not "active/full".
  test("one failing source: contextFlags explicitly includes contextSharing:limited", async () => {
    const responses = { ...baselineResponses(), health_metrics: fail("relation does not exist") };
    const { client } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);
    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    assert.ok(
      result.contextFlags.some((f) => f.key === "contextSharing" && f.state === "limited"),
      "a failed optional source must surface an explicit contextSharing:limited flag",
    );
  });

  test("multiple failing sources: still exactly one contextSharing:limited flag (not one per failure)", async () => {
    const responses = {
      ...baselineResponses(),
      health_metrics: fail("relation does not exist"),
      vision_captures: fail("timeout"),
    };
    const { client } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);
    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    const sharingFlags = result.contextFlags.filter((f) => f.key === "contextSharing");
    assert.deepEqual(sharingFlags, [{ key: "contextSharing", state: "limited" }]);
  });

  test("every source succeeds: NO contextSharing flag at all — sharing is genuinely full, not limited", async () => {
    const { client } = fakeSupabase(baselineResponses());
    const source = createSupabaseAdvisorContextDataSource(client as never);
    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    assert.ok(
      !result.contextFlags.some((f) => f.key === "contextSharing"),
      "a clean load must never claim sharing is limited",
    );
  });

  test('consent off is still reported as "disabled", distinct from a partial-failure "limited"', async () => {
    const responses = {
      ...baselineResponses(),
      advisor_context_preferences: ok({ context_sharing_enabled: false }),
    };
    const { client } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);
    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    assert.deepEqual(result.contextFlags, [{ key: "contextSharing", state: "disabled" }]);
  });

  test("all four advisors: a failing source produces contextSharing:limited for every one of them", async () => {
    const responses = { ...baselineResponses(), health_metrics: fail("relation does not exist") };
    for (const advisorId of ACTIVE_ADVISORS) {
      const { client } = fakeSupabase(responses);
      const source = createSupabaseAdvisorContextDataSource(client as never);
      const result = await buildAdvisorContextForUser("user-1", advisorId, source);
      assert.ok(
        result.contextFlags.some((f) => f.key === "contextSharing" && f.state === "limited"),
      );
    }
  });
});

describe("safeConversationContextFlags — the exact helper the real conversation-load handler calls", () => {
  test("consent on, everything succeeds: resolves with no contextSharing flag, never throws", async () => {
    const { client } = fakeSupabase(baselineResponses());
    const source = createSupabaseAdvisorContextDataSource(client as never);
    const flags = await safeConversationContextFlags("user-1", "adam", source);
    assert.ok(!flags.some((f) => f.key === "contextSharing"));
  });

  test("a source fails: resolves including contextSharing:limited, still never throws", async () => {
    const responses = { ...baselineResponses(), health_metrics: fail("relation does not exist") };
    const { client } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);
    const flags = await safeConversationContextFlags("user-1", "adam", source);
    assert.ok(
      flags.some((f) => f.key === "contextSharing" && f.state === "limited"),
      "a degraded-but-not-thrown load still surfaces the limited flag alongside the per-fact missing flags",
    );
  });

  test("the underlying source itself throws (not just a per-query error): still resolves, never rejects", async () => {
    const throwingSource: AdvisorContextDataSource = {
      hasConsent: async () => true,
      load: async () => {
        throw new Error("ADVISOR_CONTEXT_UNAVAILABLE — completely unexpected failure");
      },
    };
    await assert.doesNotReject(async () => {
      const flags = await safeConversationContextFlags("user-1", "adam", throwingSource);
      assert.deepEqual(flags, [{ key: "contextSharing", state: "limited" }]);
    });
  });

  test("consent off: resolves with contextSharing:disabled (not limited — this is a real, known state)", async () => {
    const disabledSource: AdvisorContextDataSource = {
      hasConsent: async () => false,
      load: async () => {
        throw new Error("must never be called when consent is off");
      },
    };
    const flags = await safeConversationContextFlags("user-1", "adam", disabledSource);
    assert.deepEqual(flags, [{ key: "contextSharing", state: "disabled" }]);
  });

  test("a thrown failure is logged with a sanitized operation + error-class only — never the raw error", async () => {
    const throwingSource: AdvisorContextDataSource = {
      hasConsent: async () => true,
      load: async () => {
        throw new Error('relation "health_metrics" does not exist — password foo bar');
      },
    };
    const loggedCalls: Array<[string, string]> = [];
    const flags = await safeConversationContextFlags(
      "user-1",
      "adam",
      throwingSource,
      (operation, errorName) => {
        loggedCalls.push([operation, errorName]);
      },
    );
    assert.deepEqual(flags, [{ key: "contextSharing", state: "limited" }]);
    assert.deepEqual(loggedCalls, [["conversation_context_build", "Error"]]);
    assert.doesNotMatch(JSON.stringify(loggedCalls), /health_metrics|password/);
  });

  test("all four advisors resolve without throwing, whether context succeeds or fails", async () => {
    for (const advisorId of ACTIVE_ADVISORS) {
      const okSource = createSupabaseAdvisorContextDataSource(
        fakeSupabase(baselineResponses()).client as never,
      );
      await assert.doesNotReject(() => safeConversationContextFlags("user-1", advisorId, okSource));

      const brokenSource = createSupabaseAdvisorContextDataSource(
        fakeSupabase({ ...baselineResponses(), health_metrics: fail("boom") }).client as never,
      );
      await assert.doesNotReject(() =>
        safeConversationContextFlags("user-1", advisorId, brokenSource),
      );
    }
  });
});

describe("no raw database/provider content reaches the returned context or flags", () => {
  test("a source failure never puts the raw error message/code into the result", async () => {
    const sensitiveMessage =
      'password authentication failed for user "supabase_admin" (FATAL 28P01)';
    const responses = { ...baselineResponses(), health_metrics: fail(sensitiveMessage, "28P01") };
    const { client } = fakeSupabase(responses);
    const source = createSupabaseAdvisorContextDataSource(client as never);
    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /supabase_admin|FATAL|28P01|authentication failed/);
  });

  test("degraded-source logging names only the source keys, never the raw error object", async () => {
    const originalWarn = console.warn;
    const warnCalls: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };
    try {
      const responses = {
        ...baselineResponses(),
        health_metrics: fail("relation does not exist", "42P01"),
      };
      const { client } = fakeSupabase(responses);
      const source = createSupabaseAdvisorContextDataSource(client as never);
      await buildAdvisorContextForUser("user-1", "adam", source);
      const relevant = warnCalls.filter(
        (args) =>
          typeof args[0] === "string" && args[0].includes("optional context sources failed"),
      );
      assert.equal(relevant.length, 1);
      const [, details] = relevant[0]!;
      assert.deepEqual(details, { failedSources: ["healthMetrics"] });
      assert.doesNotMatch(JSON.stringify(details), /42P01|does not exist/);
    } finally {
      console.warn = originalWarn;
    }
  });
});
