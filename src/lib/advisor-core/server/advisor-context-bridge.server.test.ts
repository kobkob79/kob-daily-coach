import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildAdvisorContextForUser } from "./advisor-context-bridge.server.ts";
import type { AdvisorContextDataSource } from "./advisor-context-bridge.server.ts";

describe("buildAdvisorContextForUser degraded loading", () => {
  test("a missing optional source adds the contextSharing: limited flag", async () => {
    const source: AdvisorContextDataSource = {
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
        _skippedSources: ["health_metrics"],
      }),
    };

    const result = await buildAdvisorContextForUser("user-1", "adam", source);
    assert.ok(
      result.contextFlags.some((f) => f.key === "contextSharing" && f.state === "limited"),
      "should add limited flag when there are skipped sources"
    );
  });
});
