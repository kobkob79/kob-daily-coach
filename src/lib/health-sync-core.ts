/**
 * Health-metrics sync ingest — pure payload validation and row-building, no
 * Supabase/TanStack dependency so it is fully unit-testable.
 * health-sync.functions.ts supplies the real, service-role-backed
 * reads/writes; nothing here can widen who may call it.
 *
 * `biologicalDay` is required in the payload rather than derived here from
 * `recordedAt` + a guessed timezone: this module may run in a server
 * process whose local clock is not the user's, and health-metrics.ts's
 * `biologicalDay()` helper (the "before 5am counts as yesterday" rule)
 * reads the *local* clock of whatever calls it. The companion app already
 * knows the user's wall-clock day when it captures a sample, exactly the
 * way the existing manual-entry path computes it client-side before
 * sending — so the ingest boundary takes that value as given rather than
 * re-deriving it and risking a wrong guess for a different timezone.
 */
import type { HealthMetricType, HealthProvider } from "./health-metrics-core.ts";
import { HEALTH_METRIC_TYPES, METRIC_UNIT } from "./health-metrics-core.ts";

export const HEALTH_SYNC_PROVIDERS = ["health_connect", "garmin", "apple_health"] as const;
export type HealthSyncProvider = (typeof HEALTH_SYNC_PROVIDERS)[number];

export const MAX_SAMPLES_PER_SYNC = 1000;

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export interface HealthSyncSample {
  metricType: HealthMetricType;
  value: number;
  unit: string;
  recordedAt: string;
  biologicalDay: string;
  externalId: string;
}

export interface HealthSyncPayload {
  provider: HealthSyncProvider;
  samples: HealthSyncSample[];
}

export class HealthSyncValidationError extends Error {
  code = "HEALTH_SYNC_INVALID_PAYLOAD" as const;
}

function nonBlankString(value: unknown, field: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new HealthSyncValidationError(`${field} is required`);
  return s;
}

function finiteNumber(value: unknown, field: string, metricType: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new HealthSyncValidationError(`${field} must be a positive finite number`);
  }
  if (
    metricType === "steps" ||
    metricType === "workout_minutes" ||
    metricType === "sleep_minutes" ||
    metricType === "heart_rate_resting"
  ) {
    if (!Number.isInteger(n)) {
      throw new HealthSyncValidationError(`${field} must be an integer for ${metricType}`);
    }
  }
  return n;
}

function isoTimestamp(value: unknown, field: string): string {
  const s = typeof value === "string" ? value : "";
  if (!RFC3339_PATTERN.test(s)) {
    throw new HealthSyncValidationError(
      `${field} must be a valid RFC3339 timestamp with offset or Z`,
    );
  }
  return s;
}

function serverDerivedBiologicalDay(recordedAtIso: string): string {
  const localDateStr = recordedAtIso.slice(0, 10);
  const localHour = parseInt(recordedAtIso.slice(11, 13), 10);
  const d = new Date(localDateStr + "T00:00:00Z");
  if (localHour < 5) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

function parseSample(raw: unknown, index: number): HealthSyncSample {
  if (!raw || typeof raw !== "object") {
    throw new HealthSyncValidationError(`samples[${index}] must be an object`);
  }
  const r = raw as Record<string, unknown>;
  const metricType = nonBlankString(r.metricType, `samples[${index}].metricType`);
  if (!(HEALTH_METRIC_TYPES as readonly string[]).includes(metricType)) {
    throw new HealthSyncValidationError(
      `samples[${index}].metricType must be one of ${HEALTH_METRIC_TYPES.join(", ")}`,
    );
  }
  const unit = nonBlankString(r.unit, `samples[${index}].unit`);
  const canonicalUnit = METRIC_UNIT[metricType as HealthMetricType];
  if (unit !== canonicalUnit) {
    throw new HealthSyncValidationError(
      `samples[${index}].unit must be ${canonicalUnit} for ${metricType}`,
    );
  }

  const recordedAt = isoTimestamp(r.recordedAt, `samples[${index}].recordedAt`);

  return {
    metricType: metricType as HealthMetricType,
    value: finiteNumber(r.value, `samples[${index}].value`, metricType),
    unit: canonicalUnit,
    recordedAt: recordedAt,
    biologicalDay: serverDerivedBiologicalDay(recordedAt),
    externalId: nonBlankString(r.externalId, `samples[${index}].externalId`),
  };
}

export function parseHealthSyncPayload(input: unknown): HealthSyncPayload {
  if (!input || typeof input !== "object") {
    throw new HealthSyncValidationError("payload must be an object");
  }
  const i = input as Record<string, unknown>;
  const provider = nonBlankString(i.provider, "provider");
  if (!(HEALTH_SYNC_PROVIDERS as readonly string[]).includes(provider)) {
    throw new HealthSyncValidationError(
      `provider must be one of ${HEALTH_SYNC_PROVIDERS.join(", ")}`,
    );
  }
  if (!Array.isArray(i.samples) || i.samples.length === 0) {
    throw new HealthSyncValidationError("samples must be a non-empty array");
  }
  if (i.samples.length > MAX_SAMPLES_PER_SYNC) {
    throw new HealthSyncValidationError(`samples must not exceed ${MAX_SAMPLES_PER_SYNC} per call`);
  }
  return { provider: provider as HealthSyncProvider, samples: i.samples.map(parseSample) };
}

export interface HealthMetricInsertRow {
  user_id: string;
  source: HealthProvider;
  metric_type: HealthMetricType;
  value: number;
  unit: string;
  recorded_at: string;
  biological_day: string;
  external_id: string;
}

export function buildHealthMetricRows(
  userId: string,
  provider: HealthSyncProvider,
  samples: HealthSyncSample[],
): HealthMetricInsertRow[] {
  return samples.map((sample) => ({
    user_id: userId,
    source: provider,
    metric_type: sample.metricType,
    value: sample.value,
    unit: sample.unit,
    recorded_at: sample.recordedAt,
    biological_day: sample.biologicalDay,
    external_id: sample.externalId,
  }));
}
