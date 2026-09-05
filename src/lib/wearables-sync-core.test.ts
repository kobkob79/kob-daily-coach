/**
 * Regression tests for wearables-sync-core.ts.
 * Run with: node --test src/lib/wearables-sync-core.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWearableMetricRows,
  matchBioDay,
  MAX_SAMPLES_PER_SYNC,
  parseWearableSyncPayload,
  WearableSyncValidationError,
  type BioDayWindow,
  type WearableMetricSample,
} from "./wearables-sync-core.ts";

function validSample(overrides: Record<string, unknown> = {}) {
  return {
    externalSource: "HealthConnect:Garmin",
    externalId: "sample-1",
    metricType: "step_count",
    value: 1200,
    unit: "steps",
    occurredAt: "2026-09-05T06:00:00.000Z",
    ...overrides,
  };
}

function sampleFixture(overrides: Partial<WearableMetricSample> = {}): WearableMetricSample {
  return {
    externalSource: "HealthConnect:Garmin",
    externalId: "sample-1",
    metricType: "step_count",
    value: 1200,
    unit: "steps",
    occurredAt: "2026-09-05T06:00:00.000Z",
    occurredAtEnd: null,
    ...overrides,
  };
}

test("parseWearableSyncPayload accepts a valid payload", () => {
  const result = parseWearableSyncPayload({
    provider: "health_connect",
    samples: [validSample()],
  });
  assert.equal(result.provider, "health_connect");
  assert.equal(result.samples.length, 1);
  assert.equal(result.samples[0].occurredAtEnd, null);
});

test("parseWearableSyncPayload normalizes occurredAt/occurredAtEnd to ISO", () => {
  const result = parseWearableSyncPayload({
    provider: "health_connect",
    samples: [
      validSample({ occurredAt: "2026-09-05T06:00:00Z", occurredAtEnd: "2026-09-05T06:05:00Z" }),
    ],
  });
  assert.equal(result.samples[0].occurredAt, "2026-09-05T06:00:00.000Z");
  assert.equal(result.samples[0].occurredAtEnd, "2026-09-05T06:05:00.000Z");
});

test("parseWearableSyncPayload rejects a missing provider", () => {
  assert.throws(
    () => parseWearableSyncPayload({ samples: [validSample()] }),
    WearableSyncValidationError,
  );
});

test("parseWearableSyncPayload rejects an empty samples array", () => {
  assert.throws(
    () => parseWearableSyncPayload({ provider: "health_connect", samples: [] }),
    WearableSyncValidationError,
  );
});

test("parseWearableSyncPayload rejects a batch over the size cap", () => {
  const samples = Array.from({ length: MAX_SAMPLES_PER_SYNC + 1 }, () => validSample());
  assert.throws(
    () => parseWearableSyncPayload({ provider: "health_connect", samples }),
    WearableSyncValidationError,
  );
});

test("parseWearableSyncPayload rejects an unknown metricType", () => {
  assert.throws(
    () =>
      parseWearableSyncPayload({
        provider: "health_connect",
        samples: [validSample({ metricType: "blood_pressure" })],
      }),
    WearableSyncValidationError,
  );
});

test("parseWearableSyncPayload rejects a non-finite value", () => {
  assert.throws(
    () =>
      parseWearableSyncPayload({
        provider: "health_connect",
        samples: [validSample({ value: Number.NaN })],
      }),
    WearableSyncValidationError,
  );
});

test("parseWearableSyncPayload rejects an unparsable occurredAt", () => {
  assert.throws(
    () =>
      parseWearableSyncPayload({
        provider: "health_connect",
        samples: [validSample({ occurredAt: "not-a-date" })],
      }),
    WearableSyncValidationError,
  );
});

test("parseWearableSyncPayload rejects occurredAtEnd before occurredAt", () => {
  assert.throws(
    () =>
      parseWearableSyncPayload({
        provider: "health_connect",
        samples: [
          validSample({
            occurredAt: "2026-09-05T06:05:00.000Z",
            occurredAtEnd: "2026-09-05T06:00:00.000Z",
          }),
        ],
      }),
    WearableSyncValidationError,
  );
});

test("matchBioDay finds the window containing the timestamp", () => {
  const windows: BioDayWindow[] = [
    {
      id: "day-1",
      startsAtMs: Date.parse("2026-09-04T05:00:00Z"),
      endsAtMs: Date.parse("2026-09-05T05:00:00Z"),
    },
    { id: "day-2", startsAtMs: Date.parse("2026-09-05T05:00:00Z"), endsAtMs: null },
  ];
  assert.equal(matchBioDay(windows, Date.parse("2026-09-04T20:00:00Z")), "day-1");
  assert.equal(matchBioDay(windows, Date.parse("2026-09-06T20:00:00Z")), "day-2");
});

test("matchBioDay treats the window as [start, end) — end instant belongs to the next day", () => {
  const boundary = Date.parse("2026-09-05T05:00:00Z");
  const windows: BioDayWindow[] = [
    { id: "day-1", startsAtMs: Date.parse("2026-09-04T05:00:00Z"), endsAtMs: boundary },
    { id: "day-2", startsAtMs: boundary, endsAtMs: null },
  ];
  assert.equal(matchBioDay(windows, boundary - 1), "day-1");
  assert.equal(matchBioDay(windows, boundary), "day-2");
});

test("matchBioDay returns null when no bio day contains the timestamp yet", () => {
  const windows: BioDayWindow[] = [
    { id: "day-1", startsAtMs: Date.parse("2026-09-05T05:00:00Z"), endsAtMs: null },
  ];
  assert.equal(matchBioDay(windows, Date.parse("2026-09-01T00:00:00Z")), null);
});

test("buildWearableMetricRows attaches bio_day_id when a window matches and null otherwise", () => {
  const windows: BioDayWindow[] = [
    { id: "day-1", startsAtMs: Date.parse("2026-09-05T05:00:00Z"), endsAtMs: null },
  ];
  const rows = buildWearableMetricRows(
    "user-1",
    "conn-1",
    [
      sampleFixture({ externalId: "in-window", occurredAt: "2026-09-05T06:00:00.000Z" }),
      sampleFixture({ externalId: "out-of-window", occurredAt: "2026-09-01T00:00:00.000Z" }),
    ],
    windows,
  );
  assert.equal(rows[0].bio_day_id, "day-1");
  assert.equal(rows[1].bio_day_id, null);
  assert.equal(rows[0].user_id, "user-1");
  assert.equal(rows[0].connection_id, "conn-1");
  assert.equal(rows[0].external_source, "HealthConnect:Garmin");
});
