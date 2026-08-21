export const ADVISOR_SERVER_EVENTS = [
  "advisor_quota_claim_failed",
  "advisor_quota_finalize_failed",
  "advisor_quota_release_failed",
  "advisor_quota_reservation_expired",
  "advisor_provider_succeeded_quota_finalize_failed",
] as const;

export type AdvisorServerEvent = (typeof ADVISOR_SERVER_EVENTS)[number];

export interface AdvisorServerEventDetails {
  error_category?: string;
  operation?: "claim" | "finalize" | "release";
}

export type AdvisorServerEventLogger = (
  event: AdvisorServerEvent,
  details?: AdvisorServerEventDetails,
) => void;

export const logAdvisorServerEvent: AdvisorServerEventLogger = (event, details = {}) => {
  console.error("[Viora Advisor AI]", {
    event,
    ...details,
  });
};
