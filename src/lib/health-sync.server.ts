import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { HealthMetricInsertRow, HealthSyncProvider } from "./health-sync-core";

interface QueryError {
  message: string;
}

interface SyncPreferenceRow {
  sync_enabled: boolean;
}

interface ConnectionRow {
  status: string;
}

interface SingleRowQuery<T> {
  select(columns: string): SingleRowQuery<T>;
  eq(column: string, value: unknown): SingleRowQuery<T>;
  maybeSingle(): Promise<{ data: T | null; error: QueryError | null }>;
}

interface UpsertQuery {
  upsert(
    rows: HealthMetricInsertRow[],
    options: { onConflict: string },
  ): {
    select(columns: string): Promise<{ data: { id: string }[] | null; error: QueryError | null }>;
  };
}

interface UpdateQuery {
  update(patch: Record<string, unknown>): {
    eq(
      column: string,
      value: unknown,
    ): { eq(column: string, value: unknown): Promise<{ error: QueryError | null }> };
  };
}

interface HealthSyncAdminClient {
  from(table: "health_sync_preferences"): SingleRowQuery<SyncPreferenceRow>;
  from(table: "health_connections"): SingleRowQuery<ConnectionRow> & UpdateQuery;
  from(table: "health_metrics"): UpsertQuery;
}

function client(): HealthSyncAdminClient {
  return supabaseAdmin as unknown as HealthSyncAdminClient;
}

export type SyncEligibility =
  { eligible: true } | { eligible: false; reason: "not_opted_in" | "not_connected" };

export class HealthSyncUnavailableError extends Error {
  code = "HEALTH_SYNC_UNAVAILABLE" as const;
  constructor(detail: string) {
    super(`Health sync is temporarily unavailable: ${detail}`);
    this.name = "HealthSyncUnavailableError";
  }
}

/** Consent and connection are both checked fresh on every sync — revoking either must stop writes immediately, not just future connects. */
export async function checkHealthSyncEligibility(
  userId: string,
  provider: HealthSyncProvider,
): Promise<SyncEligibility> {
  const { data: pref, error: prefError } = await client()
    .from("health_sync_preferences")
    .select("sync_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (prefError) throw new HealthSyncUnavailableError(prefError.message);
  if (!pref?.sync_enabled) return { eligible: false, reason: "not_opted_in" };

  const { data: connection, error: connectionError } = await client()
    .from("health_connections")
    .select("status")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (connectionError) throw new HealthSyncUnavailableError(connectionError.message);
  if (!connection || connection.status !== "connected") {
    return { eligible: false, reason: "not_connected" };
  }
  return { eligible: true };
}

/** A single upsert call over the whole batch — one SQL statement, so a batch either lands atomically or not at all. */
export async function upsertHealthMetrics(
  rows: HealthMetricInsertRow[],
): Promise<{ upserted: number }> {
  const { data, error } = await client()
    .from("health_metrics")
    .upsert(rows, { onConflict: "user_id,source,external_id" })
    .select("id");
  if (error) throw new HealthSyncUnavailableError(error.message);
  return { upserted: (data ?? []).length };
}

export async function touchHealthConnectionSynced(
  userId: string,
  provider: HealthSyncProvider,
): Promise<void> {
  const { error } = await client()
    .from("health_connections")
    .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) throw new HealthSyncUnavailableError(error.message);
}

export async function recordHealthConnectionSyncError(
  userId: string,
  provider: HealthSyncProvider,
  message: string,
): Promise<void> {
  await client()
    .from("health_connections")
    .update({ last_sync_error: message.slice(0, 500) })
    .eq("user_id", userId)
    .eq("provider", provider);
}
