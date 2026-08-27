import type { AdvisorChatRequest } from "../request";
import { AdvisorCoreError, type AdvisorChatResponse } from "../response";
import type { AdvisorQuotaStore } from "../quota";
import {
  generateAdvisorResponse,
  validateAdvisorChatRequest,
} from "./generate-advisor-response.server";
import { logAdvisorServerEvent, type AdvisorServerEventLogger } from "./observability.server";

type AdvisorResponseGenerator = (input: unknown) => Promise<AdvisorChatResponse>;

export interface QuotaProtectedAdvisorDependencies {
  quotaStore?: AdvisorQuotaStore;
  generateResponse?: AdvisorResponseGenerator;
  logEvent?: AdvisorServerEventLogger;
  /** Trusted server authorization result. Never populate from request data. */
  quotaExempt?: boolean;
}

function getErrorCategory(error: unknown): string | undefined {
  return error instanceof AdvisorCoreError ? error.code : undefined;
}

export async function generateQuotaProtectedAdvisorResponse(
  userId: string,
  input: unknown,
  dependencies: QuotaProtectedAdvisorDependencies = {},
): Promise<AdvisorChatResponse> {
  const request: AdvisorChatRequest = validateAdvisorChatRequest(input);
  const quotaStore =
    dependencies.quotaStore ?? (await import("./quota.server")).supabaseAdvisorQuotaStore;
  const generateResponse = dependencies.generateResponse ?? generateAdvisorResponse;
  const logEvent = dependencies.logEvent ?? logAdvisorServerEvent;

  if (dependencies.quotaExempt) {
    return generateResponse(request);
  }
  let claim;

  try {
    claim = await quotaStore.claim(userId);
  } catch (error) {
    logEvent("advisor_quota_claim_failed", {
      error_category: getErrorCategory(error),
      operation: "claim",
    });
    throw error;
  }

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
    } catch (releaseError) {
      logEvent("advisor_quota_release_failed", {
        error_category: getErrorCategory(releaseError),
        operation: "release",
      });
    }
    throw error;
  }

  try {
    const quota = await quotaStore.finalize(userId, claim.claimToken);
    return { ...response, quota };
  } catch (error) {
    const details = {
      error_category: getErrorCategory(error),
      operation: "finalize" as const,
    };
    logEvent("advisor_quota_finalize_failed", details);
    logEvent("advisor_provider_succeeded_quota_finalize_failed", details);
    throw error;
  }
}
