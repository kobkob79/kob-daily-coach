/**
 * Regression tests for unified-timeline.ts's provenance classification.
 * Run with: node --test src/lib/unified-timeline.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedTimeline, type DailyEventRow } from "./unified-timeline.ts";

function dailyEvent(overrides: Partial<DailyEventRow> = {}): DailyEventRow {
  return {
    id: "event-1",
    userId: "user-1",
    type: "sleep",
    occurredAt: "2026-09-05T06:00:00.000Z",
    ...overrides,
  };
}

test("a row with externalSource is classified device_measured, ahead of the direct/inferred split", () => {
  const [withoutBioDay] = buildUnifiedTimeline({
    timezone: "UTC",
    dailyEvents: [dailyEvent({ externalSource: "HealthConnect:Oura" })],
  });
  assert.equal(withoutBioDay.provenance.kind, "device_measured");
  assert.equal(withoutBioDay.provenance.externalSource, "HealthConnect:Oura");

  const [withBioDay] = buildUnifiedTimeline({
    timezone: "UTC",
    dailyEvents: [dailyEvent({ externalSource: "HealthConnect:Oura", bioDayId: "day-1" })],
  });
  assert.equal(withBioDay.provenance.kind, "device_measured");
});

test("a user-entered row (no externalSource) keeps the pre-existing direct/inferred split", () => {
  const [withBioDay] = buildUnifiedTimeline({
    timezone: "UTC",
    dailyEvents: [dailyEvent({ bioDayId: "day-1" })],
  });
  assert.equal(withBioDay.provenance.kind, "direct");
  assert.equal(withBioDay.provenance.externalSource, null);

  const [withoutBioDay] = buildUnifiedTimeline({
    timezone: "UTC",
    dailyEvents: [dailyEvent()],
  });
  assert.equal(withoutBioDay.provenance.kind, "inferred");
});

test("legacy still wins over externalSource", () => {
  const [row] = buildUnifiedTimeline({
    timezone: "UTC",
    legacyWorkouts: [
      {
        id: "w-1",
        userId: "user-1",
        name: "אימון",
        occurredAt: "2026-09-05T06:00:00.000Z",
        externalSource: "HealthConnect:Garmin",
      },
    ],
  });
  assert.equal(row.provenance.kind, "legacy");
});
