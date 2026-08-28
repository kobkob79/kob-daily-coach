import { ZodError } from "zod";
import { getAdvisorConfig, UnknownAdvisorError } from "../configs";
import { buildAdvisorInstructions } from "../instructions";
import { advisorChatRequestSchema, type AdvisorChatRequest } from "../request";
import { AdvisorCoreError, type AdvisorChatResponse } from "../response";
import { isAdvisorId } from "../types";
import { getAdvisorAIProvider } from "./provider.server";
import type { AdvisorProviderInput } from "./provider.server";

export function validateAdvisorChatRequest(input: unknown): AdvisorChatRequest {
  const advisorId =
    input && typeof input === "object" && "advisor_id" in input
      ? (input as { advisor_id?: unknown }).advisor_id
      : undefined;

  if (typeof advisorId === "string" && !isAdvisorId(advisorId)) {
    throw new AdvisorCoreError("UNKNOWN_ADVISOR", "The requested advisor does not exist.");
  }

  try {
    return advisorChatRequestSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AdvisorCoreError("INVALID_REQUEST", "The advisor request is invalid.");
    }
    throw error;
  }
}

export async function generateAdvisorResponse(
  input: unknown,
  options: Pick<AdvisorProviderInput, "history" | "context"> = {},
): Promise<AdvisorChatResponse> {
  const request = validateAdvisorChatRequest(input);

  let advisor;
  try {
    advisor = getAdvisorConfig(request.advisor_id);
  } catch (error) {
    if (error instanceof UnknownAdvisorError) {
      throw new AdvisorCoreError("UNKNOWN_ADVISOR", "The requested advisor does not exist.");
    }
    throw error;
  }

  const provider = await getAdvisorAIProvider();
  return provider.generate({
    advisor,
    instructions: buildAdvisorInstructions(advisor),
    request,
    history: options.history,
    context: options.context,
  });
}
