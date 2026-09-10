/**
 * Run with: node --test src/lib/advisor-core/server/advisor-conversation-flow.server.test.ts
 *
 * Advisor Personal Context V1 — behavioral regression for the strict consent
 * gate in `sendPersistentAdvisorMessage`
 * (VIORA-ADVISOR-CONTEXT-CLEAN-ROOM-RECOVERY-001):
 *   • no consent  → buildContext is never called, provider gets context: undefined;
 *   • consent     → the approved profile context is forwarded;
 *   • revocation  → the immediately following request gets no context;
 *   • ordinary chat keeps working with context sharing disabled;
 *   • birth_date never reaches the provider context.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { sendPersistentAdvisorMessage } from "./advisor-conversation-flow.server.ts";
import type { AdvisorConversationFlowDependencies } from "./advisor-conversation-flow.server.ts";
import type { buildAdvisorContextForUser } from "./advisor-context-bridge.server.ts";
import type { AdvisorId } from "../types.ts";
import type { AdvisorChatResponse } from "../response.ts";
import type { SendAdvisorMessageResult } from "../../advisor-conversations.ts";

interface Harness {
  buildContextCalls: number;
  providerContext: unknown;
  providerInvoked: boolean;
}

function newHarness(): Harness {
  return { buildContextCalls: 0, providerContext: null, providerInvoked: false };
}

function makeDependencies(
  harness: Harness,
  options: {
    hasConsent: () => Promise<boolean>;
    advisorId?: AdvisorId;
    contextFacts?: Record<string, unknown>;
  },
): AdvisorConversationFlowDependencies {
  const advisorId = options.advisorId ?? "adam";

  const conversationStore = {
    findOwned: async () => ({ id: "conv-1", advisor_id: advisorId, title: "T", status: "active" }),
    isEligibleRetry: async () => true,
    beginTurn: async () => ({
      created: true,
      message: {
        id: "msg-1",
        conversation_id: "conv-1",
        turn_id: "turn-1",
        retry_of_message_id: null,
        role: "user",
        content: "Hi",
        status: "pending",
        created_at: "2026-01-01T00:00:00.000Z",
        completed_at: null,
        failed_at: null,
      },
    }),
    completedHistory: async () => [],
    markGenerating: async () => {},
    completeTurn: async () => ({
      id: "asst-1",
      conversationId: "conv-1",
      turnId: "turn-1",
      retryOfMessageId: null,
      role: "assistant",
      content: "Hello",
      status: "completed",
      createdAt: "2026-01-01T00:00:01.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      failedAt: null,
    }),
    failTurn: async () => {},
  } as unknown as AdvisorConversationFlowDependencies["conversationStore"];

  const quotaStore = {
    getStatus: async () => ({ allowed: true, resets_at: null }),
  } as unknown as AdvisorConversationFlowDependencies["quotaStore"];

  const buildContext: typeof buildAdvisorContextForUser = async (userId) => {
    harness.buildContextCalls += 1;
    return {
      context: {
        userId,
        generatedAt: "2026-01-01T00:00:00.000Z",
        facts: options.contextFacts ?? {
          profile: {
            state: "known",
            value: {
              displayName: "Kobi",
              timezone: null,
              gender: "female",
              age: 34,
              heightCm: 172,
              currentWeightKg: 68,
            },
            observedAt: null,
            sources: ["profiles"],
            confidence: "reported",
          },
        },
      },
      contextFlags: [],
    };
  };

  const generateResponse: NonNullable<
    AdvisorConversationFlowDependencies["generateResponse"]
  > = async (_input, requestOptions) => {
    harness.providerInvoked = true;
    harness.providerContext = requestOptions.context;
    return {
      advisor_id: advisorId,
      response_id: "resp-1",
      text: "Hello",
      provider_metadata: { provider: "mock", model: "test" },
    } satisfies AdvisorChatResponse;
  };

  return {
    conversationStore,
    quotaStore,
    supabase: {} as unknown as AdvisorConversationFlowDependencies["supabase"],
    quotaExempt: true,
    hasContextConsent: options.hasConsent,
    buildContext,
    generateResponse,
  };
}

async function send(
  dependencies: AdvisorConversationFlowDependencies,
  advisorId: AdvisorId = "adam",
): Promise<SendAdvisorMessageResult> {
  return sendPersistentAdvisorMessage(
    "user-1",
    advisorId,
    { conversationId: "conv-1", clientRequestId: `req-${Math.random()}`, message: "Hi" },
    dependencies,
  );
}

function assertSuccess(result: SendAdvisorMessageResult) {
  assert.equal(result.status, "success");
  if (result.status !== "success") throw new Error("unreachable");
  return result.data;
}

describe("sendPersistentAdvisorMessage — personal context consent gate", () => {
  test("no consent: buildContext is not called and the provider gets context: undefined", async () => {
    const harness = newHarness();
    const result = await send(makeDependencies(harness, { hasConsent: async () => false }));

    const data = assertSuccess(result);
    assert.equal(harness.buildContextCalls, 0, "buildContext must not be called without consent");
    assert.equal(harness.providerInvoked, true, "the provider was still invoked");
    assert.equal(harness.providerContext, undefined, "provider received context: undefined");
    assert.ok(
      data.contextFlags.some((f) => f.key === "contextSharing" && f.state === "disabled"),
      "the client is told context sharing is disabled",
    );
  });

  test("ordinary chat still works with context sharing disabled", async () => {
    const harness = newHarness();
    const data = assertSuccess(
      await send(makeDependencies(harness, { hasConsent: async () => false })),
    );
    assert.equal(data.assistantMessage?.content, "Hello");
  });

  test("explicit consent: the approved profile context is forwarded to the provider", async () => {
    const harness = newHarness();
    const data = assertSuccess(
      await send(makeDependencies(harness, { hasConsent: async () => true })),
    );

    assert.equal(harness.buildContextCalls, 1);
    assert.notEqual(harness.providerContext, undefined);
    const ctx = harness.providerContext as {
      facts: Record<string, { value: Record<string, unknown> }>;
    };
    assert.equal(ctx.facts.profile.value.gender, "female");
    assert.equal(ctx.facts.profile.value.age, 34);
    assert.ok(!data.contextFlags.some((f) => f.key === "contextSharing" && f.state === "disabled"));
  });

  test("birth_date never appears in the forwarded provider context", async () => {
    const harness = newHarness();
    await send(makeDependencies(harness, { hasConsent: async () => true }));
    assert.ok(!JSON.stringify(harness.providerContext).toLowerCase().includes("birth"));
  });

  test("revocation disables context on the immediately following request", async () => {
    let consent = true;

    const first = newHarness();
    await send(makeDependencies(first, { hasConsent: async () => consent }));
    assert.notEqual(first.providerContext, undefined, "context flows while consent is granted");

    consent = false;
    const second = newHarness();
    await send(makeDependencies(second, { hasConsent: async () => consent }));
    assert.equal(second.buildContextCalls, 0, "no builder call after revocation");
    assert.equal(second.providerContext, undefined, "next request gets no context");
  });

  test("every active advisor completes a consented request and builds context once", async () => {
    for (const advisorId of ["adam", "daniel", "maya", "shiran"] as const) {
      const harness = newHarness();
      const result = await send(
        makeDependencies(harness, { hasConsent: async () => true, advisorId }),
        advisorId,
      );
      assert.equal(result.status, "success", `${advisorId} completes`);
      assert.equal(harness.buildContextCalls, 1, `${advisorId} builds context once`);
    }
  });
});
