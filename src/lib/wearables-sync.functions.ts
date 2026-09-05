/**
 * Wearable ingest endpoint — the "smallest boundary" adapter: a native
 * companion app (or future Capacitor wrapper) authenticates as the user and
 * pushes Health Connect (or similar) samples here. No client writes
 * wearable_metrics directly (see the RLS grants in
 * supabase/migrations/20260905140000_wearables_integration_foundation.sql);
 * this is the only path in.
 *
 * Scope is deliberately narrow: continuous samples (heart rate, steps, ...)
 * only. Device-sourced sleep/weight belong in daily_events and need a
 * user-entered-wins conflict rule against manual entries first — not built
 * here yet.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildWearableMetricRows, parseWearableSyncPayload } from "./wearables-sync-core";

export class WearableSyncNotEligibleError extends Error {
  code = "WEARABLE_SYNC_NOT_ELIGIBLE" as const;
  reason: "not_opted_in" | "not_connected";
  constructor(reason: "not_opted_in" | "not_connected") {
    super(
      reason === "not_opted_in"
        ? "User has not opted in to wearable sync."
        : "No connected wearable for this provider.",
    );
    this.reason = reason;
  }
}

export interface WearableSyncResult {
  received: number;
  upserted: number;
  bioDayMatched: number;
}

export const syncWearablePayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseWearableSyncPayload)
  .handler(async ({ context, data }): Promise<WearableSyncResult> => {
    const {
      checkSyncEligibility,
      fetchBioDayWindows,
      upsertWearableMetrics,
      touchConnectionSynced,
      recordConnectionSyncError,
    } = await import("./wearables-sync.server");

    const userId = String(context.userId);
    const eligibility = await checkSyncEligibility(userId, data.provider);
    if (!eligibility.eligible) {
      throw new WearableSyncNotEligibleError(eligibility.reason);
    }

    const occurredAtMsValues = data.samples.map((s) => Date.parse(s.occurredAt));
    const bioDayWindows = await fetchBioDayWindows(
      userId,
      Math.min(...occurredAtMsValues),
      Math.max(...occurredAtMsValues),
    );

    const rows = buildWearableMetricRows(
      userId,
      eligibility.connectionId,
      data.samples,
      bioDayWindows,
    );

    try {
      const { upserted, bioDayMatched } = await upsertWearableMetrics(rows);
      await touchConnectionSynced(eligibility.connectionId);
      return { received: data.samples.length, upserted, bioDayMatched };
    } catch (error) {
      await recordConnectionSyncError(eligibility.connectionId, (error as Error).message);
      throw error;
    }
  });
