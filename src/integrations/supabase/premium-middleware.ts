import { createMiddleware } from "@tanstack/react-start";
import type { MyPlan } from "@/lib/entitlements";
import { requireSupabaseAuth } from "./auth-middleware";

export class PremiumEntitlementRequiredError extends Error {
  readonly statusCode = 403;
  readonly code = "PREMIUM_ENTITLEMENT_REQUIRED" as const;

  constructor() {
    super("Premium access is required.");
    this.name = "PremiumEntitlementRequiredError";
  }
}

export const requirePremiumEntitlement = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { getUserPlan } = await import("@/lib/entitlements.server");
    const plan: MyPlan = await getUserPlan(String(context.userId));

    if (!plan.capabilities.ai) {
      throw new PremiumEntitlementRequiredError();
    }

    return next({
      context: {
        ...context,
        plan,
      },
    });
  });
