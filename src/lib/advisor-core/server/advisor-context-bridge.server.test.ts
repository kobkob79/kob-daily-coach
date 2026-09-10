import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildAdvisorContextForUser } from "./advisor-context-bridge.server.ts";
import type { AdvisorContextDataSource } from "./advisor-context-bridge.server.ts";

function createMockSource(
  overrides: Partial<Awaited<ReturnType<AdvisorContextDataSource["load"]>>> = {},
): AdvisorContextDataSource {
  return {
    hasConsent: async () => true,
    load: async () => ({
      profile: null,
      goals: [],
      bioDay: null,
      shift: null,
      medical: [],
      progress: null,
      labResults: [],
      healthMetrics: null,
      timelineInput: {
        timezone: "UTC",
        bioDayAssignments: new Map(),
        nutritionEntries: [],
        dailyEvents: [],
        workoutInstances: [],
        workoutSessions: [],
        legacyWorkouts: [],
        healthLogs: [],
      },
      conflicts: [],
      ...overrides,
    }),
  };
}

describe("buildAdvisorContextForUser", () => {
  test("1. all sources succeed - no limited flag", async () => {
    const source = createMockSource();
    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    assert.ok(
      !result.contextFlags.some((f) => f.key === "contextSharing" && f.state === "limited"),
    );
  });

  test("2. health_metrics fails - chat continues, limited flag present", async () => {
    const source = createMockSource({ degradedOptionalSources: ["health_metrics"] });
    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    const flags = result.contextFlags.filter((f) => f.key === "contextSharing");
    assert.equal(flags.length, 1);
    assert.equal(flags[0].state, "limited");
  });

  test("3. lab_results fails - chat continues, limited flag present", async () => {
    const source = createMockSource({ degradedOptionalSources: ["lab_results"] });
    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    const flags = result.contextFlags.filter((f) => f.key === "contextSharing");
    assert.equal(flags.length, 1);
    assert.equal(flags[0].state, "limited");
  });

  test("4. both fail - limited flag is present exactly once", async () => {
    const source = createMockSource({ degradedOptionalSources: ["health_metrics", "lab_results"] });
    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    const flags = result.contextFlags.filter((f) => f.key === "contextSharing");
    assert.equal(flags.length, 1);
    assert.equal(flags[0].state, "limited");
  });

  test("5. consent off - source not loaded, contextSharing is disabled", async () => {
    const source: AdvisorContextDataSource = {
      hasConsent: async () => false,
      load: async () => {
        throw new Error("Should not be called");
      },
    };
    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    const flags = result.contextFlags.filter((f) => f.key === "contextSharing");
    assert.equal(flags.length, 1);
    assert.equal(flags[0].state, "disabled");
  });

  test("6. mandatory source failure fails closed (mocking the internal try-catch in reality, here we just verify it throws if load throws)", async () => {
    const source: AdvisorContextDataSource = {
      hasConsent: async () => true,
      load: async () => {
        throw new Error("ADVISOR_CONTEXT_UNAVAILABLE");
      },
    };
    await assert.rejects(
      buildAdvisorContextForUser("user-1", "adam", source),
      /ADVISOR_CONTEXT_UNAVAILABLE/,
    );
  });
});
import { createSupabaseAdvisorContextDataSource } from "./advisor-context-bridge.server.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("createSupabaseAdvisorContextDataSource", () => {
  test("7. Fake Supabase client proves optional query failure is collected and not thrown", async () => {
    const mockSupabase = {
      from: (table: string) => {
        return {
          select: () => {
            const chain = {
              eq: () => chain,
              gte: () => chain,
              lte: () => chain,
              in: () => chain,
              or: () => chain,
              order: () => chain,
              limit: () => chain,
              maybeSingle: async () => ({ data: null, error: null }),
              then: (resolve: (val: unknown) => void) =>
                resolve({
                  data: [],
                  error: table === "health_metrics" ? new Error("DB Error") : null,
                }),
            };
            return chain;
          },
        };
      },
    } as unknown as SupabaseClient;

    const source = createSupabaseAdvisorContextDataSource(mockSupabase);

    // We must not throw
    const result = await source.load("user-1", new Date());

    // We must have exactly the failing source in degradedOptionalSources
    assert.deepEqual(result.degradedOptionalSources, ["health_metrics"]);
  });
});
