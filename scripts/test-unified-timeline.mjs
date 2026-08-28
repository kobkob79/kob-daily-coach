import assert from "node:assert/strict";
import { buildUnifiedTimeline } from "../src/lib/unified-timeline.ts";

const common = { userId: "user-a", occurredAt: "2026-08-28T10:00:00Z" };
const timeline = buildUnifiedTimeline({
  timezone: "UTC",
  nutritionEntries: [
    { ...common, id: "meal-1", title: "ארוחה", metrics: { calories: 500, proteinG: 35 } },
  ],
  dailyEvents: [
    { ...common, id: "water-1", type: "water", metrics: { ml: 500 } },
    { ...common, id: "sleep-1", type: "sleep", metrics: { hours: 7 } },
  ],
  workoutInstances: [
    {
      ...common,
      id: "instance-1",
      name: "Upper",
      scheduledAt: "2026-08-28T09:00:00Z",
      occurredAt: null,
    },
  ],
  workoutSessions: [{ ...common, id: "session-1", instanceId: "instance-1", name: "Upper" }],
  legacyWorkouts: [
    { ...common, id: "legacy-duplicate", name: " Upper ", legacy: true },
    { ...common, id: "legacy-only", name: "Run", legacy: true },
  ],
  healthLogs: [
    {
      ...common,
      id: "health-1",
      severity: 8,
      area: "private area",
      notes: "sensitive medical note",
    },
  ],
});

// 12 modern session supersedes linked instance and unambiguous legacy copy.
assert.equal(timeline.filter((entry) => entry.sourceDomain === "workout").length, 2);
assert.ok(timeline.some((entry) => entry.key === "workout_sessions:session-1"));
assert.ok(timeline.some((entry) => entry.key === "workouts:legacy-only"));
assert.ok(!timeline.some((entry) => entry.key === "workouts:legacy-duplicate"));

// 14 general projection keeps only a severity band, never sensitive details.
const health = timeline.find((entry) => entry.sourceDomain === "health");
assert.deepEqual(health.presentation.metrics, { severity: "high" });
assert.ok(!JSON.stringify(health).includes("sensitive medical note"));
assert.ok(!JSON.stringify(health).includes("private area"));
assert.deepEqual(
  timeline.map((entry) => entry.key),
  [...timeline.map((entry) => entry.key)].sort((a, b) => {
    const left =
      timeline.find((entry) => entry.key === a).occurredAt ??
      timeline.find((entry) => entry.key === a).scheduledAt ??
      "";
    const right =
      timeline.find((entry) => entry.key === b).occurredAt ??
      timeline.find((entry) => entry.key === b).scheduledAt ??
      "";
    return left.localeCompare(right) || a.localeCompare(b);
  }),
);

console.log(
  "Unified Timeline regression: PASS (stable projection, workout dedup, privacy, ordering)",
);
