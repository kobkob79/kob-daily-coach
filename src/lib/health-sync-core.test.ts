/**
 * Regression tests for health-sync-core.ts.
 * Run with: node --test src/lib/health-sync-core.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHealthMetricRows,
  MAX_SAMPLES_PER_SYNC,
  parseHealthSyncPayload,
  HealthSyncValidationError,
} from "./health-sync-core.ts";

function validSample(overrides: Record<string, unknown> = {}) {
  return {
    metricType: "heart_rate_resting",
    value: 58,
    unit: "bpm",
    recordedAt: "2026-09-06T06:00:00.000Z",
    externalId: "sample-1",
    ...overrides,
  };
}

test("parseHealthSyncPayload accepts a valid payload", () => {
  const result = parseHealthSyncPayload({
    provider: "health_connect",
    samples: [validSample()],
  });
  assert.equal(result.provider, "health_connect");
  assert.equal(result.samples.length, 1);
  assert.equal(result.samples[0].recordedAt, "2026-09-06T06:00:00.000Z");
});

test("parseHealthSyncPayload rejects 'manual' as a sync provider", () => {
  assert.throws(
    () => parseHealthSyncPayload({ provider: "manual", samples: [validSample()] }),
    HealthSyncValidationError,
  );
});

test("parseHealthSyncPayload rejects an unknown provider", () => {
  assert.throws(
    () => parseHealthSyncPayload({ provider: "fitbit", samples: [validSample()] }),
    HealthSyncValidationError,
  );
});

test("parseHealthSyncPayload rejects an empty samples array", () => {
  assert.throws(
    () => parseHealthSyncPayload({ provider: "health_connect", samples: [] }),
    HealthSyncValidationError,
  );
});

test("parseHealthSyncPayload rejects a batch over the size cap", () => {
  const samples = Array.from({ length: MAX_SAMPLES_PER_SYNC + 1 }, () => validSample());
  assert.throws(
    () => parseHealthSyncPayload({ provider: "health_connect", samples }),
    HealthSyncValidationError,
  );
});

test("parseHealthSyncPayload rejects an unknown metricType", () => {
  assert.throws(
    () =>
      parseHealthSyncPayload({
        provider: "health_connect",
        samples: [validSample({ metricType: "blood_pressure" })],
      }),
    HealthSyncValidationError,
  );
});

test("parseHealthSyncPayload rejects a non-finite value", () => {
  assert.throws(
    () =>
      parseHealthSyncPayload({
        provider: "health_connect",
        samples: [validSample({ value: Number.NaN })],
      }),
    HealthSyncValidationError,
  );
});

test("parseHealthSyncPayload rejects an unparsable recordedAt", () => {
  assert.throws(
    () =>
      parseHealthSyncPayload({
        provider: "health_connect",
        samples: [validSample({ recordedAt: "not-a-date" })],
      }),
    HealthSyncValidationError,
  );
});

test("parseHealthSyncPayload rejects a malformed biologicalDay", () => {
  assert.throws(
    () =>
      parseHealthSyncPayload({
        provider: "health_connect",
        samples: [validSample({ biologicalDay: "2026/09/06" })],
      }),
    HealthSyncValidationError,
  );
});

test("parseHealthSyncPayload rejects a blank externalId", () => {
  assert.throws(
    () =>
      parseHealthSyncPayload({
        provider: "health_connect",
        samples: [validSample({ externalId: "  " })],
      }),
    HealthSyncValidationError,
  );
});

test("buildHealthMetricRows maps provider to source and preserves every field", () => {
  const parsed = parseHealthSyncPayload({ provider: "garmin", samples: [validSample()] });
  const rows = buildHealthMetricRows("user-1", "garmin", parsed.samples);
  assert.deepEqual(rows[0], {
    user_id: "user-1",
    source: "garmin",
    metric_type: "heart_rate_resting",
    value: 58,
    unit: "bpm",
    recorded_at: "2026-09-06T06:00:00.000Z",
    biological_day: "2026-09-06",
    external_id: "sample-1",
  });
});
