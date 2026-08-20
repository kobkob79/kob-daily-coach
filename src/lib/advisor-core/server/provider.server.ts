import type { AdvisorConfig } from "../types";
import type { AdvisorChatRequest } from "../request";
import type { AdvisorChatResponse } from "../response";
import { getVioraAIProvider } from "./config.server";

export interface AdvisorProviderInput {
  advisor: AdvisorConfig;
  instructions: string;
  request: AdvisorChatRequest;
}

export interface AdvisorAIProvider {
  generate(input: AdvisorProviderInput): Promise<AdvisorChatResponse>;
}

export async function getAdvisorAIProvider(): Promise<AdvisorAIProvider> {
  const provider = getVioraAIProvider();

  if (provider === "mock") {
    const { mockAdvisorProvider } = await import("./providers/mock-provider.server");
    return mockAdvisorProvider;
  }

  const { openAIAdvisorProvider } = await import("./providers/openai-provider.server");
  return openAIAdvisorProvider;
}
