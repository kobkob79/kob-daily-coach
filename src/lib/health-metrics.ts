/**
 * Wearable / health-data connector layer (CORE-005, feeding HEALTH-007).
 *
 * `health_connections` records which provider a user has linked;
 * `health_metrics` stores the ingested samples in one provider-agnostic
 * shape so the AI coach and readiness score read a single source
 * regardless of where a sample came from.
 *
 * Health Connect and Garmin both require an integration Viora's current
 * web/PWA shell cannot perform on its own: Health Connect is an
 * on-device Android API with no cloud endpoint (it needs a native
 * wrapper, e.g. Capacitor, to read it), and Garmin requires a per-user
 * OAuth grant against Garmin's Connect API. Neither is wired up yet —
 * `disconnectProvider` below only manages the connection-status row;
 * nothing calls out to those providers today. `manual` is the only
 * source that a user can actually record through this module right now.
 */
import { supabase } from "@/integrations/supabase/client";
import { biologicalDay } from "@/lib/meals";
import { METRIC_UNIT, type HealthConnection, type HealthMetric, type HealthMetricType, type HealthProvider } from "@/lib/health-metrics-core";

export * from "@/lib/health-metrics-core";

// The generated Database types do not yet include the health_connections /
// health_metrics tables (provisioned by migration 20260906000000_*), so these
// queries go through a loosely typed handle until the types are regenerated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (table: string) => any };

export async function fetchConnections(): Promise<HealthConnection[]> {
  const { data, error } = await supabase
    .from("health_connections")
    .select("provider,status,connected_at,last_synced_at")
    .eq("status", "connected");
  if (error) throw error;
  return (data ?? []) as HealthConnection[];
}

export async function disconnectProvider(provider: HealthProvider): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("no user");
  const { error } = await supabase
    .from("health_connections")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString() })
    .eq("user_id", u.user.id)
    .eq("provider", provider);
  if (error) throw error;
}

/** Records a manual sample and marks the "manual" connection as active. */
export async function recordManualMetric(
  metric_type: HealthMetricType,
  value: number,
  recorded_at: Date = new Date(),
): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("no user");
  if (!Number.isFinite(value) || value <= 0) throw new Error("ערך לא תקין");

  const { error: metricError } = await supabase.from("health_metrics").insert({
    user_id: u.user.id,
    source: "manual",
    metric_type,
    value,
    unit: METRIC_UNIT[metric_type],
    recorded_at: recorded_at.toISOString(),
    biological_day: biologicalDay(recorded_at),
  });
  if (metricError) throw metricError;

  const { error: connError } = await supabase
    .from("health_connections")
    .upsert(
      { user_id: u.user.id, provider: "manual", status: "connected", last_synced_at: new Date().toISOString() },
      { onConflict: "user_id,provider" },
    );
  if (connError) throw connError;
}

export async function fetchRecentMetrics(days = 14): Promise<HealthMetric[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from("health_metrics")
    .select("id,source,metric_type,value,unit,recorded_at,biological_day")
    .gte("biological_day", biologicalDay(since))
    .order("recorded_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HealthMetric[];
}
