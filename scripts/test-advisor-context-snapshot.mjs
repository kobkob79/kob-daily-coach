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
  labResults: [
    {
      lab: "Superlab",
      marker: "Ferritin",
      value: "22 ng/mL",
      summary: null,
      testDate: "2026-08-20",
      freshness: "current",
    },
  ],
  healthMetrics: {
    restingHeartRate: { value: 58, unit: "bpm", recordedAt: "2026-08-28T06:00:00Z" },
    sleepMinutes: null,
    steps: { value: 8000, unit: "steps", recordedAt: "2026-08-28T06:00:00Z" },
    caloriesBurned: null,
    workoutMinutes: null,
  },
});

// Blood-test markers and wearable metrics are exposed as their own facts,
// not silently dropped. The outer fact state follows the generic 36h
// recency window (a lab result drawn 8 days ago reads "stale" there, same
// as any other non-daily fact), but each result carries its own clinically
// meaningful freshness (180-day cutoff, like medical issues).
assert.equal(snapshot.facts.labResults.state, "stale");
assert.deepEqual(snapshot.facts.labResults.value, [
  {
    lab: "Superlab",
    marker: "Ferritin",
    value: "22 ng/mL",
    summary: null,
    testDate: "2026-08-20",
    freshness: "current",
  },
]);
assert.equal(snapshot.facts.healthMetrics.state, "known");
assert.equal(snapshot.facts.healthMetrics.value.restingHeartRate.value, 58);
assert.equal(snapshot.facts.healthMetrics.value.steps.value, 8000);
// Meal/workout names are surfaced, not just aggregate totals.
assert.deepEqual(snapshot.facts.nutrition.value.mealNames, ["ארוחה"]);
assert.ok(Array.isArray(snapshot.facts.workouts.value.names));

// 13 conflicts remain explicit.
assert.equal(snapshot.facts.nutrition.state, "conflicting");
// 15-18 every advisor is one brain: each gets the full-day snapshot, not a
// domain-minimized slice (domain focus is enforced in the response, via
// domainBoundaries in instructions.ts, not by hiding facts).
const ALL_KEYS = [
  "profile",
  "goals",
  "bioDay",
  "shift",
  "nutrition",
  "hydration",
  "workouts",
  "sleep",
  "recovery",
  "limitations",
  "medical",
  "progress",
  "labResults",
  "healthMetrics",
];
for (const advisorId of ["adam", "daniel", "maya", "shiran"]) {
  assert.deepEqual(Object.keys(selectAdvisorContext(snapshot, advisorId).facts), ALL_KEYS);
}
assert.ok(!JSON.stringify(snapshot).includes("secret detail"));
const debug = toSafeAdvisorContextDebug(snapshot);
assert.ok(!JSON.stringify(debug).includes("Test"));
// 21 deterministic build performs no AI/provider/network call.
assert.equal(networkCalls, 0);
globalThis.fetch = originalFetch;

console.log(
  "Advisor Context Snapshot regression: PASS (states, selectors, privacy, zero network calls)",
);
