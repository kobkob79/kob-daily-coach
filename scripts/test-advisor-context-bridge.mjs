import assert from "node:assert/strict";
import { buildAdvisorContextForUser } from "../src/lib/advisor-core/server/advisor-context-bridge.server.ts";

const now = new Date("2026-08-28T12:00:00.000Z");
const source = {
  async load(userId) {
    return {
      profile: { displayName: "Test", timezone: "UTC" },
      goals: ["goal"],
      bioDay: null,
      shift: null,
      timelineInput: {
        timezone: "UTC",
        healthLogs: [
          {
            id: "health-1",
            userId,
            occurredAt: now.toISOString(),
            severity: 8,
            notes: "must never leave the pure data source",
            area: "private area",
          },
        ],
        nutritionEntries: [
          { id: "meal-1", userId, occurredAt: now.toISOString(), metrics: { calories: 500 } },
        ],
      },
      conflicts: ["bioDay"],
    };
  },
};

const metadata = [];
const daniel = await buildAdvisorContextForUser("user-1", "daniel", source, now, (value) =>
  metadata.push(value),
);
assert.deepEqual(Object.keys(daniel.context.facts), [
  "profile",
  "bioDay",
  "workouts",
  "limitations",
]);
assert.deepEqual(daniel.context.facts.limitations.value, { severityBands: ["high"] });
assert.equal(JSON.stringify(daniel).includes("must never"), false);
assert.equal(JSON.stringify(daniel).includes("private area"), false);
assert.ok(
  daniel.contextFlags.some((flag) => flag.key === "bioDay" && flag.state === "conflicting"),
);
assert.equal(JSON.stringify(metadata).includes("user-1"), false);
assert.equal(JSON.stringify(metadata).includes("must never"), false);

const shiran = await buildAdvisorContextForUser("user-1", "shiran", source, now, () => undefined);
assert.deepEqual(Object.keys(shiran.context.facts), [
  "profile",
  "bioDay",
  "goals",
  "nutrition",
  "hydration",
]);
assert.equal("limitations" in shiran.context.facts, false);

console.log(
  "Advisor context bridge regression: PASS (selector isolation, explicit state, sensitive projection)",
);
