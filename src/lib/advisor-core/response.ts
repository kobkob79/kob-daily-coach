import type { AdvisorId } from "./types";
import type { AdvisorDailyQuota } from "./quota";

export interface AdvisorChatResponse {
  advisor_id: AdvisorId;
  conversation_id?: string;
  response_id: string;
  text: string;
  quota?: AdvisorDailyQuota;
}

export type AdvisorCoreErrorCode =
  | "INVALID_REQUEST"
  | "UNKNOWN_ADVISOR"
  | "INVALID_AI_PROVIDER_CONFIGURATION"
  | "MISSING_OPENAI_CONFIGURATION"
  | "OPENAI_AUTH_FAILURE"
  | "OPENAI_INSUFFICIENT_QUOTA"
  | "OPENAI_MODEL_ACCESS_FAILURE"
  | "OPENAI_RATE_LIMIT"
  | "OPENAI_BAD_REQUEST"
  | "OPENAI_CONNECTION_FAILURE"
  | "OPENAI_CONNECTION_TIMEOUT"
  | "OPENAI_PROVIDER_FAILURE"
  | "ADVISOR_DAILY_QUOTA_EXCEEDED"
  | "ADVISOR_QUOTA_UNAVAILABLE"
  | "EMPTY_MODEL_RESPONSE";

export class AdvisorCoreError extends Error {
  constructor(
    readonly code: AdvisorCoreErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AdvisorCoreError";
  }
}
