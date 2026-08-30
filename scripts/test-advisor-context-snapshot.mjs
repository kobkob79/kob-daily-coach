import assert from "node:assert/strict";
import {
  buildAdvisorContextSnapshot,
  selectAdvisorContext,
  toSafeAdvisorContextDebug,
} from "../src/lib/advisor-context-snapshot.ts";
import { buildUnifiedTimeline } from "../src/lib/unified-timeline.ts";

let networkCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  networkCalls += 1;
  throw new Error("network forbidden");
};

const now = new Date("2026-08-28T12:00:00Z");
const timeline = buildUnifiedTimeline({
  timezone: "UTC",
  nutritionEntries: [
    {
      id: "meal",
      userId: "user-a",
      occurredAt: "2026-08-28T08:00:00Z",
      metrics: { calories: 500, proteinG: 30 },
    },
  ],
  dailyEvents: [
    {
      id: "water",
      userId: "user-a",
      type: "water",
      occurredAt: "2026-08-28T09:00:00Z",
      metrics: { ml: 750, goalMl: 2500 },
    },
    {
      id: "sleep",
      userId: "user-a",
      type: "sleep",
      occurredAt: "2026-08-28T05:00:00Z",
      metrics: { hours: 7 },
    },
  ],
  workoutSessions: [
    {
      id: "session",
      userId: "user-a",
      occurredAt: "2026-08-28T10:00:00Z",
      metrics: { volumeKg: 2500 },
    },
  ],
  healthLogs: [
    {
      id: "health",
      userId: "user-a",
      occurredAt: "2026-08-28T11:00:00Z",
      severity: 5,
      notes: "secret detail",
    },
  ],
});
const snapshot = buildAdvisorContextSnapshot({
  userId: "user-a",
  now,
  profile: { displayName: "Test", timezone: "UTC" },
  goals: ["strength"],
  timeline,
  shift: { kind: "day", source: "shift_config", observedAt: now.toISOString() },
  conflicts: ["nutrition"],
});

// 13 conflicts remain explicit.
assert.equal(snapshot.facts.nutrition.state, "conflicting");
// 15-18 strict advisor-specific minimum projections.
assert.deepEqual(Object.keys(selectAdvisorContext(snapshot, "adam").facts), [
  "profile",
  "bioDay",
  "shift",
  "sleep",
  "recovery",
]);
assert.deepEqual(Object.keys(selectAdvisorContext(snapshot, "daniel").facts), [
  "profile",
  "bioDay",
  "workouts",
  "limitations",
  "medical",
]);
assert.deepEqual(Object.keys(selectAdvisorContext(snapshot, "maya").facts), [
  "profile",
  "bioDay",
  "recovery",
  "limitations",
  "medical",
  "progress",
]);
assert.deepEqual(Object.keys(selectAdvisorContext(snapshot, "shiran").facts), [
  "profile",
  "bioDay",
  "goals",
  "nutrition",
  "hydration",
  "progress",
]);
assert.ok(!JSON.stringify(snapshot).includes("secret detail"));
const debug = toSafeAdvisorContextDebug(snapshot);
assert.ok(!JSON.stringify(debug).includes("Test"));
// 21 deterministic build performs no AI/provider/network call.
assert.equal(networkCalls, 0);
globalThis.fetch = originalFetch;

console.log(
  "Advisor Context Snapshot regression: PASS (states, selectors, privacy, zero network calls)",
);
