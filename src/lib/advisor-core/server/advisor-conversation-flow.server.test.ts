import { describe, test } from "node:test";
import assert from "node:assert";
import { sendPersistentAdvisorMessage } from "./advisor-conversation-flow.server";
import type { AdvisorConversationFlowDependencies } from "./advisor-conversation-flow.server";

describe("advisor-conversation-flow.server consent behavior", () => {
  test("consent off -> next provider request receives no personal context", async () => {
    let providedContext: unknown = null;

    const mockDependencies: unknown = {
      conversationStore: {
        findOwned: async () => ({ id: "conv-1", advisor_id: "adam" }),
        isEligibleRetry: async () => true,
        beginTurn: async () => ({
          created: true,
          message: { id: "msg-1", status: "pending", turn_id: "turn-1" },
        }),
        completedHistory: async () => [],
        markGenerating: async () => {},
        completeTurn: async () => ({ completedAt: new Date().toISOString() }),
        failTurn: async () => {},
      },
      quotaStore: {
        getStatus: async () => ({ allowed: true }),
        claim: async () => ({ allowed: true, claimToken: "token-1", quota: { allowed: true } }),
      },
      supabase: {},
      quotaExempt: true,
      hasContextConsent: async () => false, // Consent OFF
      buildContext: async () => ({
        context: { facts: { profile: { value: { gender: "female" } } } },
        contextFlags: [],
      }),
      generateResponse: async (input: unknown, options: unknown) => {
        providedContext = options.context;
        return { text: "Hello", provider_metadata: {} };
      },
    };

    const result = await sendPersistentAdvisorMessage(
      "user-1",
      "adam",
      { conversationId: "conv-1", clientRequestId: "req-1", message: "Hi" },
      mockDependencies,
    );

    assert.strictEqual(result.status, "success");
    // When consent is off, currentContextSharingFlags resolves to disabled, and the client sees the disabled flag
    const flags = (result as Record<string, unknown>).data.contextFlags;
    assert.ok(flags.some((f: unknown) => f.key === "contextSharing" && f.state === "disabled"));
  });
});

test("consent on -> next provider request receives the approved profile context", async () => {
  let providedContext: unknown = null;

  const mockDependencies: unknown = {
    conversationStore: {
      findOwned: async () => ({ id: "conv-1", advisor_id: "adam" }),
      isEligibleRetry: async () => true,
      beginTurn: async () => ({
        created: true,
        message: { id: "msg-1", status: "pending", turn_id: "turn-1" },
      }),
      completedHistory: async () => [],
      markGenerating: async () => {},
      completeTurn: async () => ({ completedAt: new Date().toISOString() }),
      failTurn: async () => {},
    },
    quotaStore: {
      getStatus: async () => ({ allowed: true }),
      claim: async () => ({ allowed: true, claimToken: "token-1", quota: { allowed: true } }),
    },
    supabase: {},
    quotaExempt: true,
    hasContextConsent: async () => true, // Consent ON
    buildContext: async () => ({
      context: { generatedAt: "2024", facts: { profile: { value: { gender: "female" } } } },
      contextFlags: [],
    }),
    generateResponse: async (input: unknown, options: unknown) => {
      providedContext = options.context;
      return { text: "Hello", provider_metadata: {} };
    },
  };

  const result = await sendPersistentAdvisorMessage(
    "user-1",
    "adam",
    { conversationId: "conv-1", clientRequestId: "req-1", message: "Hi" },
    mockDependencies,
  );

  assert.strictEqual(result.status, "success");
  const flags = (result as Record<string, unknown>).data.contextFlags;
  assert.ok(!flags.some((f: unknown) => f.key === "contextSharing" && f.state === "disabled"));
  assert.ok(providedContext !== undefined);
  assert.strictEqual(providedContext.facts.profile.value.gender, "female");
});

test("consent revoked -> the immediately following provider request receives no personal context", async () => {
  let providedContext: unknown = null;

  const mockDependencies: unknown = {
    conversationStore: {
      findOwned: async () => ({ id: "conv-1", advisor_id: "adam" }),
      isEligibleRetry: async () => true,
      beginTurn: async () => ({
        created: true,
        message: { id: "msg-1", status: "pending", turn_id: "turn-1" },
      }),
      completedHistory: async () => [],
      markGenerating: async () => {},
      completeTurn: async () => ({ completedAt: new Date().toISOString() }),
      failTurn: async () => {},
    },
    quotaStore: {
      getStatus: async () => ({ allowed: true }),
      claim: async () => ({ allowed: true, claimToken: "token-1", quota: { allowed: true } }),
    },
    supabase: {},
    quotaExempt: true,
    hasContextConsent: async () => false, // Revoked
    buildContext: async () => ({
      context: { generatedAt: "2024", facts: { profile: { value: { gender: "female" } } } },
      contextFlags: [],
    }),
    generateResponse: async (input: unknown, options: unknown) => {
      providedContext = options.context;
      return { text: "Hello", provider_metadata: {} };
    },
  };

  const result = await sendPersistentAdvisorMessage(
    "user-1",
    "adam",
    { conversationId: "conv-1", clientRequestId: "req-1", message: "Hi" },
    mockDependencies,
  );

  assert.strictEqual(result.status, "success");
  const flags = (result as Record<string, unknown>).data.contextFlags;
  assert.ok(flags.some((f: unknown) => f.key === "contextSharing" && f.state === "disabled"));
  assert.strictEqual(providedContext, undefined);
});
