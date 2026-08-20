import OpenAI from "openai";
import { AdvisorCoreError } from "../response";

let openAIClient: OpenAI | undefined;

export function createOpenAIClient(): OpenAI {
  if (openAIClient) return openAIClient;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AdvisorCoreError(
      "MISSING_OPENAI_CONFIGURATION",
      "OpenAI is not configured on the server.",
    );
  }

  openAIClient = new OpenAI({ apiKey, maxRetries: 0 });
  return openAIClient;
}
