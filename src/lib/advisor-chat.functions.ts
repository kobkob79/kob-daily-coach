import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AdvisorCoreError,
  type AdvisorChatResponse,
  type AdvisorCoreErrorCode,
} from "@/lib/advisor-core/response";
import type { AdvisorDailyQuota } from "@/lib/advisor-core/quota";

type AdvisorChatServerResult =
  | { ok: true; response: AdvisorChatResponse }
  | {
      ok: false;
      error_code: AdvisorCoreErrorCode | "ADVISOR_REQUEST_FAILED";
    };

type AdvisorQuotaStatusServerResult =
  { ok: true; quota: AdvisorDailyQuota } | { ok: false; error_code: "ADVISOR_QUOTA_UNAVAILABLE" };

export const getAdvisorDailyQuotaServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorQuotaStatusServerResult> => {
    const { supabaseAdvisorQuotaStore } = await import("@/lib/advisor-core/server/quota.server");

    try {
      const quota = await supabaseAdvisorQuotaStore.getStatus(String(context.userId));
      return { ok: true, quota };
    } catch {
      return { ok: false, error_code: "ADVISOR_QUOTA_UNAVAILABLE" };
    }
  });

export const generateAdvisorResponseServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input)
  .handler(async ({ data, context }): Promise<AdvisorChatServerResult> => {
    const { generateQuotaProtectedAdvisorResponse } =
      await import("@/lib/advisor-core/server/quota-flow.server");

    try {
      const response = await generateQuotaProtectedAdvisorResponse(String(context.userId), data);

      return { ok: true, response };
    } catch (error) {
      return {
        ok: false,
        error_code: error instanceof AdvisorCoreError ? error.code : "ADVISOR_REQUEST_FAILED",
      };
    }
  });
