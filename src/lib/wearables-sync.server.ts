import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { BioDayWindow, WearableMetricInsertRow } from "./wearables-sync-core";

interface QueryError {
  message: string;
}

interface SyncPreferenceRow {
  sync_enabled: boolean;
}

interface ConnectionRow {
  id: string;
  status: string;
}

interface BioDayRow {
  id: string;
  starts_at: string;
  ends_at: string | null;
}

interface SingleRowQuery<T> {
  select(columns: string): SingleRowQuery<T>;
  eq(column: string, value: unknown): SingleRowQuery<T>;
  maybeSingle(): Promise<{ data: T | null; error: QueryError | null }>;
}

interface RangeQuery<T> {
  select(columns: string): RangeQuery<T>;
  eq(column: string, value: unknown): RangeQuery<T>;
  lte(column: string, value: unknown): RangeQuery<T>;
  or(filter: string): Promise<{ data: T[] | null; error: QueryError | null }>;
}

interface UpsertQuery {
  upsert(
    rows: WearableMetricInsertRow[],
    options: { onConflict: string },
  ): Promise<{
    data: { id: string; bio_day_id: string | null }[] | null;
    error: QueryError | null;
  }>;
}

interface UpdateQuery {
  update(patch: Record<string, unknown>): {
    eq(column: string, value: unknown): Promise<{ error: QueryError | null }>;
  };
}

interface WearablesAdminClient {
  from(table: "wearable_sync_preferences"): SingleRowQuery<SyncPreferenceRow>;
  from(table: "user_wearable_connections"): SingleRowQuery<ConnectionRow> & UpdateQuery;
  from(table: "bio_days"): RangeQuery<BioDayRow>;
  from(table: "wearable_metrics"): UpsertQuery;
}

function client(): WearablesAdminClient {
  return supabaseAdmin as unknown as WearablesAdminClient;
}

export type SyncEligibility =
  | { eligible: true; connectionId: string }
  | { eligible: false; reason: "not_opted_in" | "not_connected" };

export class WearableSyncUnavailableError extends Error {
  code = "WEARABLE_SYNC_UNAVAILABLE" as const;
  constructor(detail: string) {
    super(`Wearable sync is temporarily unavailable: ${detail}`);
    this.name = "WearableSyncUnavailableError";
  }
}

/** Consent and connection are checked fresh on every sync — revoking either must stop writes immediately, not just future connects. */
export async function checkSyncEligibility(
  userId: string,
  provider: string,
): Promise<SyncEligibility> {
  const { data: pref, error: prefError } = await client()
    .from("wearable_sync_preferences")
    .select("sync_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (prefError) throw new WearableSyncUnavailableError(prefError.message);
  if (!pref?.sync_enabled) return { eligible: false, reason: "not_opted_in" };

  const { data: connection, error: connectionError } = await client()
    .from("user_wearable_connections")
    .select("id,status")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (connectionError) throw new WearableSyncUnavailableError(connectionError.message);
  if (!connection || connection.status !== "connected") {
    return { eligible: false, reason: "not_connected" };
  }
  return { eligible: true, connectionId: connection.id };
}

/** Only looks up bio days that already exist for this span — never creates one on the ingest path. */
export async function fetchBioDayWindows(
  userId: string,
  fromMs: number,
  toMs: number,
): Promise<BioDayWindow[]> {
  const { data, error } = await client()
    .from("bio_days")
    .select("id,starts_at,ends_at")
    .eq("user_id", userId)
    .lte("starts_at", new Date(toMs).toISOString())
    .or(`ends_at.is.null,ends_at.gte.${new Date(fromMs).toISOString()}`);
  if (error) throw new WearableSyncUnavailableError(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    startsAtMs: Date.parse(row.starts_at),
    endsAtMs: row.ends_at ? Date.parse(row.ends_at) : null,
  }));
}

/** A single upsert call over the whole batch — one SQL statement, so a batch either lands atomically or not at all. */
export async function upsertWearableMetrics(
  rows: WearableMetricInsertRow[],
): Promise<{ upserted: number; bioDayMatched: number }> {
  const { data, error } = await client()
    .from("wearable_metrics")
    .upsert(rows, { onConflict: "user_id,external_source,external_id" });
  if (error) throw new WearableSyncUnavailableError(error.message);
  const written = data ?? [];
  return {
    upserted: written.length,
    bioDayMatched: written.filter((row) => row.bio_day_id !== null).length,
  };
}

export async function touchConnectionSynced(connectionId: string): Promise<void> {
  const { error } = await client()
    .from("user_wearable_connections")
    .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
    .eq("id", connectionId);
  if (error) throw new WearableSyncUnavailableError(error.message);
}

export async function recordConnectionSyncError(
  connectionId: string,
  message: string,
): Promise<void> {
  await client()
    .from("user_wearable_connections")
    .update({ last_sync_error: message.slice(0, 500) })
    .eq("id", connectionId);
}
