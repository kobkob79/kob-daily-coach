import { AdvisorCoreError } from "../response";

export const VIORA_AI_PROVIDERS = ["mock", "openai"] as const;
export type VioraAIProvider = (typeof VIORA_AI_PROVIDERS)[number];

export const VIORA_ADVISOR_MODEL = "gpt-5.6-terra";
export const VIORA_ADVISOR_MAX_OUTPUT_TOKENS = 1200;
export const VIORA_ADVISOR_REASONING_EFFORT = "low" as const;
export const VIORA_ADVISOR_REQUEST_TIMEOUT_MS = 60_000;

export function getVioraAIProvider(): VioraAIProvider {
  const configuredProvider = process.env.VIORA_AI_PROVIDER?.trim().toLowerCase();

  if (!configuredProvider && process.env.NODE_ENV !== "production") {
    return "mock";
  }

  if (configuredProvider === "mock" || configuredProvider === "openai") {
    return configuredProvider;
  }

  throw new AdvisorCoreError(
    "INVALID_AI_PROVIDER_CONFIGURATION",
    configuredProvider
      ? "The configured Viora AI provider is not supported."
      : "VIORA_AI_PROVIDER must be configured on the production server.",
  );
}
