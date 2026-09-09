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

test("parseHealthSyncPayload correctly derives server biologicalDay based on local time from RFC3339", () => {
  const parsed1 = parseHealthSyncPayload({
    provider: "apple_health",
    samples: [
      {
        metricType: "sleep_minutes",
        value: 480,
        unit: "min",
        recordedAt: "2026-09-08T04:59:00.000+03:00",
        externalId: "ext1",
      },
    ],
  });
  assert.equal(parsed1.samples[0].biologicalDay, "2026-09-07");

  const parsed2 = parseHealthSyncPayload({
    provider: "apple_health",
    samples: [
      {
        metricType: "sleep_minutes",
        value: 480,
        unit: "min",
        recordedAt: "2026-09-08T05:01:00.000+03:00",
        externalId: "ext1",
      },
    ],
  });
  assert.equal(parsed2.samples[0].biologicalDay, "2026-09-08");
});

test("parseHealthSyncPayload correctly rejects client biologicalDay", () => {
  assert.throws(
    () =>
      parseHealthSyncPayload({
        provider: "apple_health",
        samples: [{ ...validSample(), biologicalDay: "2026-09-06" }],
      }),
    (err: Error) =>
      err instanceof HealthSyncValidationError && err.message.includes("cannot be provided"),
  );
});

test("parseHealthSyncPayload rejects semantic RFC3339 violations", () => {
  const cases = [
    "2026-13-01T12:00:00Z", // month 13
    "2026-02-31T12:00:00Z", // 31st feb
    "2026-01-01T25:00:00Z", // hour 25
    "2026-01-01T12:00:00+99:99", // offset bad
    "2026-01-01T12:00:00", // missing offset
  ];
  for (const c of cases) {
    assert.throws(
      () =>
        parseHealthSyncPayload({
          provider: "apple_health",
          samples: [{ ...validSample(), recordedAt: c }],
        }),
      HealthSyncValidationError,
    );
  }
});

test("parseHealthSyncPayload strict value bounds", () => {
  assert.throws(
    () =>
      parseHealthSyncPayload({
        provider: "apple_health",
        samples: [{ ...validSample(), metricType: "steps", value: 300000 }],
      }),
    HealthSyncValidationError,
  );
  assert.throws(
    () =>
      parseHealthSyncPayload({
        provider: "apple_health",
        samples: [{ ...validSample(), metricType: "heart_rate_resting", value: 0 }],
      }),
    HealthSyncValidationError,
  );
  assert.throws(
    () =>
      parseHealthSyncPayload({
        provider: "apple_health",
        samples: [{ ...validSample(), metricType: "steps", value: "100" }],
      }),
    HealthSyncValidationError,
  );
});
