/**
 * Wearable ingest — pure validation, bio-day matching, and row-building
 * logic, injected with no Supabase/TanStack dependency so it is fully
 * unit-testable. wearables-sync.functions.ts supplies the real,
 * service-role-backed reads/writes; nothing here can widen who may call it.
 *
 * Scope: continuous device-measured samples only (heart rate, steps, ...)
 * landing in wearable_metrics. Sleep/weight from a device land in
 * daily_events and need a user-entered-wins conflict rule against manual
 * entries — that's a separate, not-yet-built piece (see the audit's item 9
 * "conflict resolution"), so this module deliberately does not touch
 * daily_events.
 */

export const WEARABLE_METRIC_TYPES = [
  "heart_rate",
  "resting_heart_rate",
  "step_count",
  "calories_active",
  "calories_resting",
  "distance_meters",
  "spo2",
  "respiratory_rate",
] as const;

export type WearableMetricType = (typeof WEARABLE_METRIC_TYPES)[number];

export const MAX_SAMPLES_PER_SYNC = 1000;

export interface WearableMetricSample {
  externalSource: string;
  externalId: string;
  metricType: WearableMetricType;
  value: number;
  unit: string;
  occurredAt: string;
  occurredAtEnd: string | null;
}

export interface WearableSyncPayload {
  provider: string;
  samples: WearableMetricSample[];
}

export class WearableSyncValidationError extends Error {
  code = "WEARABLE_SYNC_INVALID_PAYLOAD" as const;
}

function nonBlankString(value: unknown, field: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new WearableSyncValidationError(`${field} is required`);
  return s;
}

function finiteNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n))
    throw new WearableSyncValidationError(`${field} must be a finite number`);
  return n;
}

function isoTimestamp(value: unknown, field: string): string {
  const s = typeof value === "string" ? value : "";
  const ms = Date.parse(s);
  if (!s || Number.isNaN(ms))
    throw new WearableSyncValidationError(`${field} must be an ISO timestamp`);
  return new Date(ms).toISOString();
}

function parseSample(raw: unknown, index: number): WearableMetricSample {
  if (!raw || typeof raw !== "object") {
    throw new WearableSyncValidationError(`samples[${index}] must be an object`);
  }
  const r = raw as Record<string, unknown>;
  const metricType = nonBlankString(r.metricType, `samples[${index}].metricType`);
  if (!(WEARABLE_METRIC_TYPES as readonly string[]).includes(metricType)) {
    throw new WearableSyncValidationError(
      `samples[${index}].metricType must be one of ${WEARABLE_METRIC_TYPES.join(", ")}`,
    );
  }
  const occurredAt = isoTimestamp(r.occurredAt, `samples[${index}].occurredAt`);
  const occurredAtEnd =
    r.occurredAtEnd == null
      ? null
      : isoTimestamp(r.occurredAtEnd, `samples[${index}].occurredAtEnd`);
  if (occurredAtEnd && Date.parse(occurredAtEnd) < Date.parse(occurredAt)) {
    throw new WearableSyncValidationError(`samples[${index}].occurredAtEnd must be >= occurredAt`);
  }
  return {
    externalSource: nonBlankString(r.externalSource, `samples[${index}].externalSource`),
    externalId: nonBlankString(r.externalId, `samples[${index}].externalId`),
    metricType: metricType as WearableMetricType,
    value: finiteNumber(r.value, `samples[${index}].value`),
    unit: nonBlankString(r.unit, `samples[${index}].unit`),
    occurredAt,
    occurredAtEnd,
  };
}

export function parseWearableSyncPayload(input: unknown): WearableSyncPayload {
  if (!input || typeof input !== "object") {
    throw new WearableSyncValidationError("payload must be an object");
  }
  const i = input as Record<string, unknown>;
  const provider = nonBlankString(i.provider, "provider");
  if (!Array.isArray(i.samples) || i.samples.length === 0) {
    throw new WearableSyncValidationError("samples must be a non-empty array");
  }
  if (i.samples.length > MAX_SAMPLES_PER_SYNC) {
    throw new WearableSyncValidationError(
      `samples must not exceed ${MAX_SAMPLES_PER_SYNC} per call`,
    );
  }
  return { provider, samples: i.samples.map(parseSample) };
}

export interface BioDayWindow {
  id: string;
  startsAtMs: number;
  endsAtMs: number | null;
}

/** Mirrors bio-day.ts's isTimestampWithinBioDay: [startsAt, endsAt) — or open-ended. Returns null with no matching, still-open day (never creates one). */
export function matchBioDay(windows: BioDayWindow[], occurredAtMs: number): string | null {
  const hit = windows.find(
    (w) => occurredAtMs >= w.startsAtMs && (w.endsAtMs === null || occurredAtMs < w.endsAtMs),
  );
  return hit ? hit.id : null;
}

export interface WearableMetricInsertRow {
  user_id: string;
  connection_id: string;
  bio_day_id: string | null;
  metric_type: WearableMetricType;
  value: number;
  unit: string;
  occurred_at: string;
  occurred_at_end: string | null;
  external_source: string;
  external_id: string;
}

export function buildWearableMetricRows(
  userId: string,
  connectionId: string,
  samples: WearableMetricSample[],
  bioDayWindows: BioDayWindow[],
): WearableMetricInsertRow[] {
  return samples.map((sample) => ({
    user_id: userId,
    connection_id: connectionId,
    bio_day_id: matchBioDay(bioDayWindows, Date.parse(sample.occurredAt)),
    metric_type: sample.metricType,
    value: sample.value,
    unit: sample.unit,
    occurred_at: sample.occurredAt,
    occurred_at_end: sample.occurredAtEnd,
    external_source: sample.externalSource,
    external_id: sample.externalId,
  }));
}
