import type { AdvisorConfig } from "../types";
import type { AdvisorChatRequest } from "../request";
import type { AdvisorChatResponse } from "../response";
import { getVioraAIProvider } from "./config.server";
import type { AdvisorMessageRole } from "@/lib/advisor-conversations";
import type { AdvisorContextBridgeResult } from "./advisor-context-bridge.server";

export interface AdvisorProviderInput {
  advisor: AdvisorConfig;
  instructions: string;
  request: AdvisorChatRequest;
  history?: ReadonlyArray<{ role: AdvisorMessageRole; content: string }>;
  context?: Omit<AdvisorContextBridgeResult["context"], "userId">;
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
