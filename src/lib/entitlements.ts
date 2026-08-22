export const PREMIUM_AI_ENTITLEMENT = "premium_ai" as const;

export const ENTITLEMENT_STATUSES = ["active", "trialing", "expired", "revoked"] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export type VioraPlan = "free" | "premium";

export interface PremiumEntitlementRecord {
  entitlement_key: typeof PREMIUM_AI_ENTITLEMENT;
  status: EntitlementStatus;
  starts_at: string;
  expires_at: string | null;
}

export interface MyPlan {
  plan: VioraPlan;
  status: EntitlementStatus | "none";
  expiresAt: string | null;
  capabilities: {
    ai: boolean;
  };
}

export function isPremiumEntitlementActive(
  entitlement: PremiumEntitlementRecord | null,
  now: Date = new Date(),
): boolean {
  if (!entitlement || entitlement.entitlement_key !== PREMIUM_AI_ENTITLEMENT) return false;
  if (entitlement.status !== "active" && entitlement.status !== "trialing") return false;

  const startsAt = Date.parse(entitlement.starts_at);
  const expiresAt = entitlement.expires_at ? Date.parse(entitlement.expires_at) : null;
  const nowMs = now.getTime();

  if (!Number.isFinite(startsAt) || startsAt > nowMs) return false;
  return expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > nowMs);
}

export function resolveMyPlan(
  entitlement: PremiumEntitlementRecord | null,
  now: Date = new Date(),
): MyPlan {
  const isPremium = isPremiumEntitlementActive(entitlement, now);
  const hasElapsed =
    entitlement?.expires_at !== null &&
    entitlement?.expires_at !== undefined &&
    Date.parse(entitlement.expires_at) <= now.getTime();
  const status =
    entitlement &&
    hasElapsed &&
    (entitlement.status === "active" || entitlement.status === "trialing")
      ? "expired"
      : (entitlement?.status ?? "none");

  return {
    plan: isPremium ? "premium" : "free",
    status,
    expiresAt: entitlement?.expires_at ?? null,
    capabilities: { ai: isPremium },
  };
}
