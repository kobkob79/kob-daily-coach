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
    try {
      const { recordHealthConnectionSyncError } = await import("./health-sync.server");
      const userId = String(context.userId);
      const correlationId = crypto.randomUUID();

      // Block all automated syncs through this PWA boundary until Edge Function is ready
      const safeErrorCategory = "SYNC_DISABLED_PENDING_EDGE_FUNCTION";
      console.error(`HealthSyncError [${correlationId}]: ${safeErrorCategory}`);

      // Try to log it, but if DB fails, it shouldn't leak
      try {
        await recordHealthConnectionSyncError(userId, data.provider, safeErrorCategory);
      } catch (dbError) {
        console.error(`HealthSyncError [${correlationId}]: Failed to write error state`);
      }

      throw new Error(`Health sync failed. Reference: ${correlationId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Health sync failed")) {
        throw error;
      }
      const correlationId = crypto.randomUUID();
      console.error(`HealthSyncError [${correlationId}]: SYNC_UNKNOWN_ERROR`);
      throw new Error(`Health sync failed. Reference: ${correlationId}`);
    }
  });
