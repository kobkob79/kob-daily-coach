import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  PREMIUM_AI_ENTITLEMENT,
  resolveMyPlan,
  type MyPlan,
  type PremiumEntitlementRecord,
} from "./entitlements";

interface QueryError {
  message: string;
}

interface EntitlementQueryBuilder {
  select(columns: string): EntitlementQueryBuilder;
  eq(column: string, value: unknown): EntitlementQueryBuilder;
  maybeSingle(): Promise<{
    data: PremiumEntitlementRecord | null;
    error: QueryError | null;
  }>;
}

interface UntypedEntitlementClient {
  from(table: string): EntitlementQueryBuilder;
}

export class EntitlementUnavailableError extends Error {
  constructor() {
    super("Entitlement status is temporarily unavailable.");
    this.name = "EntitlementUnavailableError";
  }
}

export async function getUserPremiumEntitlement(
  userId: string,
): Promise<PremiumEntitlementRecord | null> {
  const client = supabaseAdmin as unknown as UntypedEntitlementClient;
  const { data, error } = await client
    .from("user_entitlements")
    .select("entitlement_key,status,starts_at,expires_at")
    .eq("user_id", userId)
    .eq("entitlement_key", PREMIUM_AI_ENTITLEMENT)
    .maybeSingle();

  if (error) {
    console.error("[Viora Entitlements] Lookup failed", {
      event: "premium_entitlement_lookup_failed",
    });
    throw new EntitlementUnavailableError();
  }

  return data;
}

export async function getUserPlan(userId: string, now: Date = new Date()): Promise<MyPlan> {
  return resolveMyPlan(await getUserPremiumEntitlement(userId), now);
}
