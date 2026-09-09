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
  externalId: string;
  biologicalDay?: string;
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
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new HealthSyncValidationError(`${field} must be a positive finite number`);
  }

  const n = value;

  if (metricType === "steps") {
    if (!Number.isInteger(n) || n > 250000) {
      throw new HealthSyncValidationError(`${field} must be an integer between 0-250000 for steps`);
    }
  } else if (metricType === "sleep_minutes" || metricType === "workout_minutes") {
    if (!Number.isInteger(n) || n > 1440) {
      throw new HealthSyncValidationError(`${field} must be an integer between 0-1440 for minutes`);
    }
  } else if (metricType === "heart_rate_resting") {
    if (!Number.isInteger(n) || n < 20 || n > 300) {
      throw new HealthSyncValidationError(
        `${field} must be an integer between 20-300 for resting heart rate`,
      );
    }
  } else if (metricType === "calories_burned") {
    if (n > 50000) {
      throw new HealthSyncValidationError(`${field} must be between 0-50000 for calories`);
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

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new HealthSyncValidationError(`${field} is semantically invalid`);
  }

  const localDateStr = s.slice(0, 10);
  const localYear = parseInt(s.slice(0, 4), 10);
  const localMonth = parseInt(s.slice(5, 7), 10);
  const localDay = parseInt(s.slice(8, 10), 10);
  const localHour = parseInt(s.slice(11, 13), 10);
  const localMin = parseInt(s.slice(14, 16), 10);
  const localSec = parseInt(s.slice(17, 19), 10);

  if (localHour > 23 || localMin > 59 || localSec > 59) {
    throw new HealthSyncValidationError(`${field} contains invalid time`);
  }

  const daysInMonth = new Date(localYear, localMonth, 0).getDate();
  if (localMonth < 1 || localMonth > 12 || localDay < 1 || localDay > daysInMonth) {
    throw new HealthSyncValidationError(`${field} contains invalid date`);
  }

  if (!s.endsWith("Z")) {
    const match = s.match(/([+-])(\d{2}):(\d{2})$/);
    if (match) {
      const oh = parseInt(match[2], 10);
      const om = parseInt(match[3], 10);
      if (oh > 14 || om > 59) {
        throw new HealthSyncValidationError(`${field} contains invalid offset`);
      }
    }
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
  if ("biologicalDay" in r) {
    throw new HealthSyncValidationError(
      `samples[${index}].biologicalDay cannot be provided by the client`,
    );
  }
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
    biological_day: sample.biologicalDay!,
    external_id: sample.externalId,
  }));
}
