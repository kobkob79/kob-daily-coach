/**
 * Health-metrics sync ingest endpoint — the "smallest boundary" adapter: a
 * native companion app (or future Capacitor wrapper) authenticates as the
 * user and pushes Health Connect / Garmin / Apple Health samples here. No
 * client writes health_metrics with an external_id directly; RLS lets
 * clients insert (for manual entry, see health-metrics.ts) but only this
 * service-role path can upsert on conflict, so a redelivered automated
 * sample updates in place instead of duplicating.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildHealthMetricRows, parseHealthSyncPayload } from "./health-sync-core";

export class HealthSyncNotEligibleError extends Error {
  code = "HEALTH_SYNC_NOT_ELIGIBLE" as const;
  reason: "not_opted_in" | "not_connected";
  constructor(reason: "not_opted_in" | "not_connected") {
    super(
      reason === "not_opted_in"
        ? "User has not opted in to automated health sync."
        : "No connected provider for this sync request.",
    );
    this.reason = reason;
  }
}

export interface HealthSyncResult {
  received: number;
  upserted: number;
}

export const syncHealthPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseHealthSyncPayload)
  .handler(async ({ context, data }): Promise<HealthSyncResult> => {
    const {
      checkHealthSyncEligibility,
      upsertHealthMetrics,
      touchHealthConnectionSynced,
      recordHealthConnectionSyncError,
    } = await import("./health-sync.server");

    const userId = String(context.userId);
    const eligibility = await checkHealthSyncEligibility(userId, data.provider);
    if (!eligibility.eligible) {
      throw new HealthSyncNotEligibleError(eligibility.reason);
    }

    const rows = buildHealthMetricRows(userId, data.provider, data.samples);

    try {
      const { upserted } = await upsertHealthMetrics(rows);
      await touchHealthConnectionSynced(userId, data.provider);
      return { received: data.samples.length, upserted };
    } catch (error) {
      await recordHealthConnectionSyncError(userId, data.provider, (error as Error).message);
      throw error;
    }
  });
