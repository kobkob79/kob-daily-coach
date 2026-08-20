import type { AdvisorChatRequest } from "../request";
import { AdvisorCoreError, type AdvisorChatResponse } from "../response";
import type { AdvisorQuotaStore } from "../quota";
import {
  generateAdvisorResponse,
  validateAdvisorChatRequest,
} from "./generate-advisor-response.server";
import { supabaseAdvisorQuotaStore } from "./quota.server";

type AdvisorResponseGenerator = (
  input: unknown,
) => Promise<AdvisorChatResponse>;

export interface QuotaProtectedAdvisorDependencies {
  quotaStore?: AdvisorQuotaStore;
  generateResponse?: AdvisorResponseGenerator;
}

export async function generateQuotaProtectedAdvisorResponse(
  userId: string,
  input: unknown,
  dependencies: QuotaProtectedAdvisorDependencies = {},
): Promise<AdvisorChatResponse> {
  const request: AdvisorChatRequest = validateAdvisorChatRequest(input);
  const quotaStore = dependencies.quotaStore ?? supabaseAdvisorQuotaStore;
  const generateResponse = dependencies.generateResponse ?? generateAdvisorResponse;
  const claim = await quotaStore.claim(userId);

  if (!claim.quota.allowed) {
    throw new AdvisorCoreError(
      "ADVISOR_DAILY_QUOTA_EXCEEDED",
      "The daily advisor question has already been used.",
    );
  }

  let response: AdvisorChatResponse;
  try {
    response = await generateResponse(request);
  } catch (error) {
    try {
      await quotaStore.release(userId, claim.claimToken);
    } catch {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Viora Advisor AI] Failed to release advisor quota reservation");
      }
    }
    throw error;
  }

  await quotaStore.finalize(userId, claim.claimToken);
  return response;
}
