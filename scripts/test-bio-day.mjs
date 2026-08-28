import assert from "node:assert/strict";
import {
  adaptLegacyBiologicalDay,
  closeBioDay,
  correctBioDay,
  findOrCreateOpenBioDay,
  formatDateInTimezone,
  isTimestampWithinBioDay,
  reassignEventToBioDay,
  resolveBioDayBoundary,
  resolveTimestampToBioDay,
} from "../src/lib/bio-day.ts";

const base = {
  id: "day-1",
  userId: "user-a",
  timezone: "Asia/Jerusalem",
  startsAt: "2026-08-28T02:00:00.000Z",
  endsAt: null,
  localDate: "2026-08-28",
  source: "legacy_fallback",
  status: "open",
  boundaryMetadata: {},
  correctionMetadata: null,
  correctedAt: null,
  createdAt: "2026-08-28T02:00:00.000Z",
  updatedAt: "2026-08-28T02:00:00.000Z",
};

const rows = [base];
const assignments = [];
const store = {
  async findOpen(userId) {
    return rows.find((row) => row.userId === userId && row.status === "open") ?? null;
  },
  async findContaining(userId, occurredAt) {
    return (
      rows.find(
        (row) => row.userId === userId && isTimestampWithinBioDay(row, new Date(occurredAt)),
      ) ?? null
    );
  },
  async create(input) {
    const row = {
      ...input,
      id: `day-${rows.length + 1}`,
      createdAt: input.startsAt,
      updatedAt: input.startsAt,
    };
    rows.push(row);
    return row;
  },
  async update(userId, id, patch) {
    const index = rows.findIndex((row) => row.id === id && row.userId === userId);
    if (index < 0) throw new Error("Forbidden");
    rows[index] = { ...rows[index], ...patch };
    return rows[index];
  },
  async assign(input) {
    if (input.userId !== rows.find((row) => row.id === input.bioDayId)?.userId)
      throw new Error("Forbidden");
    const result = { ...input, id: `assignment-${assignments.length + 1}` };
    assignments.push(result);
    return result;
  },
};

// 1 ordinary daytime; 2 night shift; 3 after midnight; 4 02:00 prior waking period.
assert.equal(
  resolveBioDayBoundary({ now: new Date("2026-08-28T10:00:00Z"), timezone: "UTC" }).localDate,
  "2026-08-28",
);
assert.equal(
  resolveBioDayBoundary({
    now: new Date("2026-08-28T23:00:00Z"),
    timezone: "UTC",
    shiftStartAt: new Date("2026-08-28T20:00:00Z"),
  }).source,
  "shift_inferred",
);
assert.equal(
  resolveBioDayBoundary({
    now: new Date("2026-08-29T02:00:00Z"),
    timezone: "UTC",
    scheduleStartAt: new Date("2026-08-28T20:00:00Z"),
  }).localDate,
  "2026-08-28",
);
assert.equal(
  resolveBioDayBoundary({ now: new Date("2026-08-29T02:00:00Z"), timezone: "UTC" }).localDate,
  "2026-08-28",
);

// 5 main sleep crossing midnight can close explicitly; 6 a nap has no implicit side effect.
assert.equal(
  (await closeBioDay(store, "user-a", "day-1", new Date("2026-08-29T03:00:00Z"))).status,
  "closed",
);
const napBoundary = resolveBioDayBoundary({
  now: new Date("2026-08-29T12:00:00Z"),
  timezone: "UTC",
  explicitWakeAt: new Date("2026-08-29T06:00:00Z"),
});
assert.equal(napBoundary.source, "explicit");

// 7 timezone offset; 8 DST uses recorded IANA rules and stays on the correct local date.
assert.equal(
  formatDateInTimezone(new Date("2026-08-28T22:30:00Z"), "Asia/Jerusalem"),
  "2026-08-29",
);
assert.equal(
  resolveBioDayBoundary({ now: new Date("2026-03-29T04:30:00Z"), timezone: "Europe/Berlin" })
    .localDate,
  "2026-03-29",
);

// 9 auditable correction; 10 late import; 11 legacy adapter.
const corrected = await correctBioDay(store, rows[0], {
  startsAt: new Date("2026-08-28T03:00:00Z"),
  endsAt: new Date("2026-08-29T03:00:00Z"),
  reason: "wake time confirmed",
  correctedAt: new Date("2026-08-29T04:00:00Z"),
});
assert.equal(corrected.source, "manual_correction");
assert.equal(corrected.correctionMetadata.previousStartsAt, base.startsAt);
assert.equal(
  (await resolveTimestampToBioDay(store, "user-a", new Date("2026-08-28T10:00:00Z"))).id,
  "day-1",
);
assert.equal(adaptLegacyBiologicalDay("2026-08-27", "UTC").startsAt, "2026-08-27T05:00:00.000Z");

// 19/20 store ownership cannot be forged through correction or assignment.
await assert.rejects(
  () => closeBioDay(store, "user-b", "day-1", new Date("2026-08-29T05:00:00Z")),
  /Forbidden/,
);
await assert.rejects(
  () =>
    reassignEventToBioDay(store, {
      userId: "user-b",
      bioDayId: "day-1",
      sourceDomain: "nutrition",
      sourceTable: "nutrition_entries",
      sourceRecordId: "event-1",
      assignmentMetadata: {},
      reason: "test",
    }),
  /Forbidden/,
);
const created = await findOrCreateOpenBioDay(store, "user-b", {
  now: new Date("2026-08-29T10:00:00Z"),
  timezone: "UTC",
});
assert.equal(created.userId, "user-b");

console.log("Bio Day regression: PASS (boundaries, timezone/DST, correction, legacy, ownership)");
