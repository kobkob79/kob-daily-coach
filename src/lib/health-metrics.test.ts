/**
 * Run with: node --test src/lib/health-metrics.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { latestByType, type HealthMetric } from "./health-metrics-core.ts";

function metric(overrides: Partial<HealthMetric>): HealthMetric {
  return {
    id: "1",
    source: "manual",
    metric_type: "steps",
    value: 100,
    unit: "steps",
    recorded_at: "2026-09-06T10:00:00.000Z",
    biological_day: "2026-09-06",
    ...overrides,
  };
}

test("latestByType keeps the first (most recent) sample per metric type", () => {
  const metrics = [
    metric({ id: "a", metric_type: "steps", value: 9000, recorded_at: "2026-09-06T20:00:00.000Z" }),
    metric({ id: "b", metric_type: "steps", value: 3000, recorded_at: "2026-09-06T08:00:00.000Z" }),
    metric({ id: "c", metric_type: "heart_rate_resting", value: 58, recorded_at: "2026-09-06T07:00:00.000Z" }),
  ];

  const latest = latestByType(metrics);

  assert.equal(latest.steps?.id, "a");
  assert.equal(latest.heart_rate_resting?.id, "c");
  assert.equal(latest.sleep_minutes, undefined);
});

test("latestByType returns an empty object for no metrics", () => {
  assert.deepEqual(latestByType([]), {});
});
