export const ADVISOR_IDS = ["adam", "daniel", "maya", "shiran"] as const;

export type AdvisorId = (typeof ADVISOR_IDS)[number];

export type AdvisorVersion =
  | "adam_advisor_v1"
  | "daniel_advisor_v1"
  | "maya_advisor_v1"
  | "shiran_advisor_v1";

export interface AdvisorConfig {
  id: AdvisorId;
  displayName: string;
  domain: string;
  version: AdvisorVersion;
  personality: readonly string[];
  decisionFramework: readonly string[];
  domainBoundaries: readonly string[];
  responseStyle: readonly string[];
  safetyExtensions: readonly string[];
}

export function isAdvisorId(value: string): value is AdvisorId {
  return ADVISOR_IDS.some((advisorId) => advisorId === value);
}
