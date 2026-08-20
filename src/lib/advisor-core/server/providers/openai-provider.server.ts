import OpenAI, { type APIError } from "openai";
import type { AdvisorAIProvider } from "../provider.server";
import { AdvisorCoreError, type AdvisorCoreErrorCode } from "../../response";
import {
  VIORA_ADVISOR_MAX_OUTPUT_TOKENS,
  VIORA_ADVISOR_MODEL,
  VIORA_ADVISOR_REASONING_EFFORT,
} from "../config.server";
import { createOpenAIClient } from "../openai-client.server";

interface SafeOpenAIErrorDiagnostics {
  status?: number;
  code?: string;
  type?: string;
  request_id?: string;
}

interface SafeOpenAIConnectionDiagnostics {
  error_name: string;
  has_cause: boolean;
  cause_code?: string;
}

interface OpenAITextResponse {
  id?: string;
  output_text?: string;
  output: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
  status?: string;
  usage?: unknown;
}

interface ExtractedResponseText {
  source: "output_text" | "output" | "none";
  text: string;
}

type ClassifiableOpenAIError = Pick<APIError, "status" | "code" | "type">;

export function classifyOpenAIAPIError(error: ClassifiableOpenAIError): AdvisorCoreErrorCode {
  const code = error.code?.toLowerCase();

  if (error.status === 401 || code === "invalid_api_key") {
    return "OPENAI_AUTH_FAILURE";
  }
  if (code === "insufficient_quota") {
    return "OPENAI_INSUFFICIENT_QUOTA";
  }
  if (
    error.status === 403 ||
    code === "model_not_found" ||
    code === "model_not_supported" ||
    code === "unsupported_model"
  ) {
    return "OPENAI_MODEL_ACCESS_FAILURE";
  }
  if (error.status === 429) {
    return "OPENAI_RATE_LIMIT";
  }
  if (error.status === 400 || error.status === 422) {
    return "OPENAI_BAD_REQUEST";
  }

  return "OPENAI_PROVIDER_FAILURE";
}

function getSafeOpenAIErrorDiagnostics(error: APIError): SafeOpenAIErrorDiagnostics {
  return {
    status: error.status,
    code: error.code ?? undefined,
    type: error.type,
    request_id: error.requestID ?? undefined,
  };
}

function logOpenAIErrorForDevelopment(
  category: AdvisorCoreErrorCode,
  diagnostics: SafeOpenAIErrorDiagnostics | SafeOpenAIConnectionDiagnostics,
): void {
  if (process.env.NODE_ENV === "production") return;

  console.error("[Viora Advisor AI] OpenAI request failed", {
    category,
    ...diagnostics,
  });
}

function extractResponseText(response: OpenAITextResponse): ExtractedResponseText {
  const aggregateText = response.output_text?.trim() ?? "";
  if (aggregateText) {
    return { source: "output_text", text: aggregateText };
  }

  const outputText = response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text")
    .map((content) => content.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");

  return outputText
    ? { source: "output", text: outputText }
    : { source: "none", text: "" };
}

function logOpenAIResponseForSmokeTest(
  response: OpenAITextResponse,
  extraction: ExtractedResponseText,
): void {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.VIORA_AI_SMOKE_DIAGNOSTICS !== "1"
  ) {
    return;
  }

  console.info("[Viora Advisor AI] OpenAI response metadata", {
    extraction_source: extraction.source,
    output_count: response.output.length,
    output_text_length: response.output_text?.length ?? 0,
    output_types: response.output.map((item) => item.type),
    response_id_exists: Boolean(response.id),
    status: response.status,
    usage: response.usage,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getSafeNetworkErrorCode(cause: unknown): string | undefined {
  if (!isRecord(cause) || typeof cause.code !== "string") return undefined;

  return /^(?:ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|CERT_[A-Z0-9_]+|SELF_SIGNED_CERT_[A-Z0-9_]+|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|ERR_TLS_CERT_ALTNAME_INVALID)$/.test(cause.code)
    ? cause.code
    : undefined;
}

function getSafeCauseCode(cause: unknown): string | undefined {
  return (
    getSafeNetworkErrorCode(cause) ||
    (isRecord(cause) ? getSafeNetworkErrorCode(cause.cause) : undefined)
  );
}

function getSafeConnectionDiagnostics(error: unknown): SafeOpenAIConnectionDiagnostics {
  const record = isRecord(error) ? error : undefined;
  const cause = record?.cause;

  return {
    error_name:
      typeof record?.name === "string" ? record.name : "APIConnectionError",
    has_cause: cause !== undefined,
    cause_code: getSafeCauseCode(cause),
  };
}

function hasErrorName(error: unknown, name: string): boolean {
  return isRecord(error) && error.name === name;
}

export const openAIAdvisorProvider: AdvisorAIProvider = {
  async generate({ instructions, request }) {
    const client = createOpenAIClient();
    let response;

    try {
      response = await client.responses.create({
        model: VIORA_ADVISOR_MODEL,
        instructions,
        input: request.message,
        max_output_tokens: VIORA_ADVISOR_MAX_OUTPUT_TOKENS,
        reasoning: { effort: VIORA_ADVISOR_REASONING_EFFORT },
        store: false,
      });
    } catch (error) {
      if (error instanceof AdvisorCoreError) throw error;

      if (
        error instanceof OpenAI.APIConnectionTimeoutError ||
        hasErrorName(error, "APIConnectionTimeoutError")
      ) {
        const category = "OPENAI_CONNECTION_TIMEOUT";
        logOpenAIErrorForDevelopment(category, getSafeConnectionDiagnostics(error));

        throw new AdvisorCoreError(category, "The advisor service timed out.");
      }

      if (
        error instanceof OpenAI.APIConnectionError ||
        hasErrorName(error, "APIConnectionError")
      ) {
        const category = "OPENAI_CONNECTION_FAILURE";
        logOpenAIErrorForDevelopment(category, getSafeConnectionDiagnostics(error));

        throw new AdvisorCoreError(category, "The advisor service could not be reached.");
      }

      if (error instanceof OpenAI.APIError) {
        const category = classifyOpenAIAPIError(error);
        logOpenAIErrorForDevelopment(category, getSafeOpenAIErrorDiagnostics(error));

        throw new AdvisorCoreError(category, "The advisor service is temporarily unavailable.");
      }

      throw new AdvisorCoreError(
        "OPENAI_PROVIDER_FAILURE",
        "The advisor service is temporarily unavailable.",
      );
    }

    const extraction = extractResponseText(response);
    logOpenAIResponseForSmokeTest(response, extraction);

    const text = extraction.text;
    if (!text) {
      throw new AdvisorCoreError("EMPTY_MODEL_RESPONSE", "The advisor returned an empty response.");
    }

    return {
      advisor_id: request.advisor_id,
      conversation_id: request.conversation_id,
      response_id: response.id,
      text,
    };
  },
};
