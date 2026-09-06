/**
 * Pure types and helpers for the wearable/health connector layer.
 * No I/O — see health-metrics.ts for the Supabase-backed reads/writes.
 */

export type HealthProvider = "health_connect" | "garmin" | "apple_health" | "manual";

export const HEALTH_METRIC_TYPES = [
  "heart_rate_resting",
  "sleep_minutes",
  "steps",
  "calories_burned",
  "workout_minutes",
] as const;
export type HealthMetricType = (typeof HEALTH_METRIC_TYPES)[number];

export const PROVIDER_LABEL: Record<HealthProvider, string> = {
  health_connect: "Google Health Connect",
  garmin: "Garmin Connect",
  apple_health: "Apple Health",
  manual: "הזנה ידנית",
};

export const METRIC_LABEL: Record<HealthMetricType, string> = {
  heart_rate_resting: "דופק במנוחה",
  sleep_minutes: "שינה",
  steps: "צעדים",
  calories_burned: "קלוריות שנשרפו",
  workout_minutes: "דקות אימון",
};

export const METRIC_UNIT: Record<HealthMetricType, string> = {
  heart_rate_resting: "bpm",
  sleep_minutes: "min",
  steps: "steps",
  calories_burned: "kcal",
  workout_minutes: "min",
};

export interface HealthConnection {
  provider: HealthProvider;
  status: "connected" | "disconnected";
  connected_at: string;
  last_synced_at: string | null;
}

export interface HealthMetric {
  id: string;
  source: HealthProvider;
  metric_type: HealthMetricType;
  value: number;
  unit: string;
  recorded_at: string;
  biological_day: string;
}

/** Latest sample per metric type, for a compact "today" summary card. */
export function latestByType(
  metrics: HealthMetric[],
): Partial<Record<HealthMetricType, HealthMetric>> {
  const out: Partial<Record<HealthMetricType, HealthMetric>> = {};
  for (const m of metrics) {
    if (!out[m.metric_type]) out[m.metric_type] = m;
  }
  return out;
}
