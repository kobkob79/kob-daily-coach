export interface AdvisorContextConsent {
  enabled: boolean;
  consentedAt: string | null;
  revokedAt: string | null;
}

export type GetAdvisorContextConsentResult =
  | { status: "success"; data: AdvisorContextConsent }
  | { status: "error"; error: { code: "PERSISTENCE_UNAVAILABLE"; retryable: true } };

export type SetAdvisorContextConsentResult = GetAdvisorContextConsentResult;

export const DISABLED_ADVISOR_CONTEXT_CONSENT: AdvisorContextConsent = {
  enabled: false,
  consentedAt: null,
  revokedAt: null,
};
