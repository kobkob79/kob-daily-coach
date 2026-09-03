import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADVISOR_HISTORY_MAX_MESSAGES,
  boundCompletedAdvisorHistory,
  normalizeAdvisorConversationSnippet,
  type AdvisorContextFlag,
  type AdvisorQuotaPresentation,
  type SendAdvisorMessageInput,
  type SendAdvisorMessageResult,
} from "../../advisor-conversations.ts";
import type { AdvisorQuotaStore } from "../quota";
import type { AdvisorId } from "../types";
import {
  buildAdvisorContextForUser,
  createSupabaseAdvisorContextDataSource,
} from "./advisor-context-bridge.server.ts";
import type { AdvisorConversationStore } from "./conversation-store.server";
import { logAdvisorServerEvent } from "./observability.server.ts";
import { budgetAdvisorRequestContext, withBudgetFlag } from "./advisor-context-budget.server.ts";

type AdvisorResponseGenerator = (
  input: unknown,
  options: {
    history?: ReadonlyArray<{ role: "user" | "assistant"; content: string }>;
    context?: { generatedAt: string; facts: Record<string, unknown> };
  },
) => Promise<import("../response.ts").AdvisorChatResponse>;

function messageDto(row: {
  id: string;
  conversation_id: string;
  turn_id: string;
  retry_of_message_id: string | null;
  role: "user" | "assistant";
  content: string;
  status: import("../../advisor-conversations.ts").AdvisorMessageStatus;
  created_at: string;
  completed_at: string | null;
  failed_at: string | null;
}) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    turnId: row.turn_id,
    retryOfMessageId: row.retry_of_message_id,
    role: row.role,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
  };
}

export interface AdvisorConversationFlowDependencies {
  conversationStore: AdvisorConversationStore;
  quotaStore: AdvisorQuotaStore;
  supabase: SupabaseClient;
  quotaExempt: boolean;
  generateResponse?: AdvisorResponseGenerator;
  buildContext?: typeof buildAdvisorContextForUser;
  hasContextConsent?: (userId: string) => Promise<boolean>;
}

async function currentContextSharingFlags(
  userId: string,
  dependencies: AdvisorConversationFlowDependencies,
): Promise<AdvisorContextFlag[]> {
  const hasConsent =
    dependencies.hasContextConsent ??
    createSupabaseAdvisorContextDataSource(dependencies.supabase).hasConsent;
  return (await hasConsent(userId)) ? [] : [{ key: "contextSharing", state: "disabled" }];
}

function dailyQuota(
  quota: Awaited<ReturnType<AdvisorQuotaStore["getStatus"]>>,
): AdvisorQuotaPresentation {
  return {
    mode: "daily",
    state: quota.allowed ? "available" : "exhausted",
    resetsAt: quota.resets_at,
  };
}

const unlimitedQuota: AdvisorQuotaPresentation = {
  mode: "unlimited",
  state: "available",
  resetsAt: null,
};

async function currentQuota(
  userId: string,
  dependencies: AdvisorConversationFlowDependencies,
): Promise<AdvisorQuotaPresentation> {
  return dependencies.quotaExempt
    ? unlimitedQuota
    : dailyQuota(await dependencies.quotaStore.getStatus(userId));
}

function safeFailure(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ADVISOR_DAILY_QUOTA_EXCEEDED"
  ) {
    return { code: "DAILY_QUOTA_EXCEEDED" as const, retryable: false };
  }
  return { code: "PROVIDER_UNAVAILABLE" as const, retryable: true };
}

export async function sendPersistentAdvisorMessage(
  userId: string,
  advisorId: AdvisorId,
  input: SendAdvisorMessageInput,
  dependencies: AdvisorConversationFlowDependencies,
): Promise<SendAdvisorMessageResult> {
  const store = dependencies.conversationStore;
  const conversation = await store.findOwned(userId, input.conversationId);
  if (!conversation || conversation.advisor_id !== advisorId) {
    return { status: "error", error: { code: "NOT_FOUND", retryable: false } };
  }

  if (
    input.retryOfMessageId &&
    !(await store.isEligibleRetry(
      userId,
      input.conversationId,
      input.retryOfMessageId,
      input.clientRequestId,
    ))
  ) {
    return { status: "error", error: { code: "RETRY_NOT_ALLOWED", retryable: false } };
  }

  const begun = await store.beginTurn({
    conversationId: input.conversationId,
    userId,
    clientRequestId: input.clientRequestId,
    message: input.message,
    retryOfMessageId: input.retryOfMessageId,
  });
  const userMessage = messageDto(begun.message);

  if (!begun.created) {
    if (begun.message.status === "completed") {
      const assistant = await store.assistantForTurn(
        userId,
        input.conversationId,
        begun.message.turn_id,
      );
      let contextFlags: AdvisorContextFlag[];
      try {
        contextFlags = await currentContextSharingFlags(userId, dependencies);
      } catch {
        return { status: "error", error: { code: "PERSISTENCE_UNAVAILABLE", retryable: true } };
      }
      return {
        status: "success",
        data: {
          conversation: {
            id: conversation.id,
            advisorId: conversation.advisor_id,
            title: conversation.title,
            status: conversation.status,
            isCurrent: conversation.is_current,
            lastMessageAt: conversation.last_message_at,
            lastMessageSnippet: null,
            createdAt: conversation.created_at,
            updatedAt: conversation.updated_at,
          },
          userMessage,
          assistantMessage: assistant ? messageDto(assistant) : null,
          quota: await currentQuota(userId, dependencies),
          contextFlags,
        },
      };
    }
    if (["pending_quota", "generating"].includes(begun.message.status)) {
      return { status: "pending", requestId: input.clientRequestId };
    }
    return { status: "error", error: { code: "RETRY_NOT_ALLOWED", retryable: false } };
  }

  let claimToken: string | null = null;
  let quota = unlimitedQuota;
  if (!dependencies.quotaExempt) {
    let claim;
    try {
      claim = await dependencies.quotaStore.claim(userId);
    } catch {
      logAdvisorServerEvent("advisor_quota_claim_failed", { operation: "claim" });
      await store.failTurn(userId, begun.message.id, null, "interrupted", "QUOTA_UNAVAILABLE");
      return { status: "error", error: { code: "QUOTA_UNAVAILABLE", retryable: true } };
    }
    if (!claim.quota.allowed) {
      await store.failTurn(
        userId,
        begun.message.id,
        null,
        "quota_rejected",
        "DAILY_QUOTA_EXCEEDED",
      );
      return { status: "error", error: { code: "DAILY_QUOTA_EXCEEDED", retryable: false } };
    }
    claimToken = claim.claimToken;
    quota = dailyQuota(claim.quota);
  }

  let contextFlags: AdvisorContextFlag[] = [];
  try {
    await store.markGenerating(userId, begun.message.id);
    const history = boundCompletedAdvisorHistory(
      await store.completedHistory(userId, input.conversationId, ADVISOR_HISTORY_MAX_MESSAGES),
    );
    // Strict consent gate: without explicit consent the personal-context
    // builder is never called and the provider receives no context at all.
    const hasConsent =
      dependencies.hasContextConsent ??
      createSupabaseAdvisorContextDataSource(dependencies.supabase).hasConsent;
    const consentGranted = await hasConsent(userId);
    const contextResult = consentGranted
      ? await (dependencies.buildContext ?? buildAdvisorContextForUser)(
          userId,
          advisorId,
          createSupabaseAdvisorContextDataSource(dependencies.supabase),
        )
      : null;
    const budgeted = budgetAdvisorRequestContext(
      {
        generatedAt: contextResult?.context.generatedAt ?? new Date().toISOString(),
        facts: contextResult?.context.facts ?? {},
      },
      history,
    );
    contextFlags =
      consentGranted && contextResult
        ? withBudgetFlag(contextResult.contextFlags, budgeted.truncated)
        : [{ key: "contextSharing", state: "disabled" }];
    const generateResponse =
      dependencies.generateResponse ??
      (await import("./generate-advisor-response.server.ts")).generateAdvisorResponse;
    const response = await generateResponse(
      { advisor_id: advisorId, conversation_id: input.conversationId, message: input.message },
      {
        history: budgeted.history,
        context: consentGranted ? budgeted.context : undefined,
      },
    );
    const metadata = response.provider_metadata;
    let assistantMessage;
    try {
      assistantMessage = await store.completeTurn({
        userId,
        userMessageId: begun.message.id,
        assistantMessageId: randomUUID(),
        claimToken,
        content: response.text,
        provider: metadata?.provider ?? "openai",
        model: metadata?.model ?? "unknown",
        providerResponseId: response.response_id,
        usage: metadata
          ? {
              inputTokens: metadata.input_tokens,
              outputTokens: metadata.output_tokens,
              reasoningTokens: metadata.reasoning_tokens,
              totalTokens: metadata.total_tokens,
            }
          : undefined,
      });
    } catch {
      logAdvisorServerEvent("advisor_provider_succeeded_quota_finalize_failed", {
        operation: "finalize",
      });
      await store
        .failTurn(
          userId,
          begun.message.id,
          claimToken,
          "finalize_failed",
          "PERSISTENCE_UNAVAILABLE",
        )
        .catch(() => undefined);
      return { status: "error", error: { code: "PERSISTENCE_UNAVAILABLE", retryable: true } };
    }
    if (!dependencies.quotaExempt && quota.mode === "daily") {
      quota = { ...quota, state: "exhausted" };
    }
    return {
      status: "success",
      data: {
        conversation: {
          id: conversation.id,
          advisorId: conversation.advisor_id,
          title: conversation.title,
          status: conversation.status,
          isCurrent: conversation.is_current,
          lastMessageAt: assistantMessage.completedAt,
          lastMessageSnippet: normalizeAdvisorConversationSnippet(response.text),
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
        },
        userMessage: {
          ...userMessage,
          status: "completed",
          completedAt: assistantMessage.completedAt,
        },
        assistantMessage,
        quota,
        contextFlags,
      },
    };
  } catch (error) {
    try {
      await store.failTurn(
        userId,
        begun.message.id,
        claimToken,
        "provider_failed",
        safeFailure(error).code,
      );
    } catch {
      if (claimToken)
        await dependencies.quotaStore.release(userId, claimToken).catch(() => undefined);
    }
    return { status: "error", error: safeFailure(error) };
  }
}
