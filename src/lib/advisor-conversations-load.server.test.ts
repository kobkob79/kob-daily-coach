/**
 * Run with: node --test src/lib/advisor-conversations-load.server.test.ts
 *
 * VIORA-P0-MOBILE-RUNTIME-RECOVERY-CLAUDE-001 — Incident B, the composed
 * "load a conversation" path as it exists in
 * getAdvisorConversationMessagesServer (advisor-conversations.functions.ts).
 *
 * That handler itself can't be imported under plain `node --test` — it's a
 * TanStack Start server function (`createServerFn`) and depends on the
 * "@/..." path alias, both of which only Vite resolves (see the file's own
 * comment structure and e.g. exercise-motion-draft.functions.ts for the same
 * documented limitation elsewhere in this codebase). So this harness
 * reproduces its exact sequence — findOwned → try { buildAdvisorContextForUser }
 * catch { degrade } → listMessages — using a fake store and the REAL
 * `buildAdvisorContextForUser`, to prove the composed behavior the ticket
 * requires. A second block below pins the actual protection in place in the
 * real file via a source-pattern check, so a future edit can't quietly drop
 * the try/catch this test suite is exercising.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { buildAdvisorContextForUser } from "./advisor-core/server/advisor-context-bridge.server.ts";
import type { AdvisorContextDataSource } from "./advisor-core/server/advisor-context-bridge.server.ts";
import type { ContextAdvisorId } from "./advisor-context-snapshot.ts";
import type { AdvisorContextFlag } from "./advisor-conversations.ts";

interface FakeConversation {
  id: string;
  advisor_id: ContextAdvisorId;
  title: string | null;
  status: "active";
  is_current: boolean;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FakeMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Mirrors getAdvisorConversationMessagesServer's handler body exactly:
 *  find the conversation, then isolate context-building from the rest of
 *  the load so a context failure can never turn into a load failure. */
async function loadConversationLikeTheRealHandler(
  userId: string,
  conversation: FakeConversation | null,
  messages: FakeMessage[],
  contextSource: AdvisorContextDataSource,
): Promise<
  | { status: "error"; error: { code: string; retryable: boolean } }
  | {
      status: "success";
      data: {
        conversation: FakeConversation;
        messages: FakeMessage[];
        contextFlags: readonly AdvisorContextFlag[];
      };
    }
> {
  if (!conversation) return { status: "error", error: { code: "NOT_FOUND", retryable: false } };

  let contextFlags: readonly AdvisorContextFlag[];
  try {
    const contextResult = await buildAdvisorContextForUser(
      userId,
      conversation.advisor_id,
      contextSource,
    );
    contextFlags = contextResult.contextFlags;
  } catch {
    contextFlags = [{ key: "contextSharing", state: "limited" }];
  }

  return { status: "success", data: { conversation, messages, contextFlags } };
}

function conversation(overrides: Partial<FakeConversation> = {}): FakeConversation {
  return {
    id: "conv-1",
    advisor_id: "adam",
    title: null,
    status: "active",
    is_current: true,
    last_message_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

/** A context source that behaves like the live bug: consent is on, but one
 *  underlying table query always errors (a relation that isn't deployed). */
const brokenHealthMetricsSource: AdvisorContextDataSource = {
  hasConsent: async () => true,
  load: async () => {
    throw new Error("ADVISOR_CONTEXT_UNAVAILABLE — health_metrics relation does not exist");
  },
};

const workingSource: AdvisorContextDataSource = {
  hasConsent: async () => true,
  load: async (userId, now) => ({
    profile: {
      displayName: "Kobi",
      timezone: null,
      gender: "male",
      age: 34,
      heightCm: 180,
      currentWeightKg: 80,
    },
    goals: [],
    bioDay: null,
    shift: null,
    medical: [],
    progress: null,
    labResults: [],
    healthMetrics: null,
    timelineInput: {
      timezone: "UTC",
      bioDayAssignments: new Map(),
      nutritionEntries: [],
      dailyEvents: [],
      workoutInstances: [],
      workoutSessions: [],
      legacyWorkouts: [],
      healthLogs: [],
    },
    conflicts: [],
  }),
};

describe("conversation load survives a context-build failure (the actual production bug)", () => {
  for (const advisorId of ["adam", "daniel", "maya", "shiran"] as const) {
    test(`${advisorId}: existing conversation with messages still loads when context building throws`, async () => {
      const result = await loadConversationLikeTheRealHandler(
        "user-1",
        conversation({ advisor_id: advisorId }),
        [
          { id: "m1", role: "user", content: "Hi" },
          { id: "m2", role: "assistant", content: "Hello!" },
        ],
        brokenHealthMetricsSource,
      );
      assert.equal(result.status, "success");
      if (result.status !== "success") return;
      assert.equal(result.data.messages.length, 2, "existing message history is preserved");
      assert.deepEqual(result.data.contextFlags, [{ key: "contextSharing", state: "limited" }]);
    });
  }

  test("empty conversation (no messages yet) still loads successfully when context building throws", async () => {
    const result = await loadConversationLikeTheRealHandler(
      "user-1",
      conversation(),
      [],
      brokenHealthMetricsSource,
    );
    assert.equal(result.status, "success");
    if (result.status !== "success") return;
    assert.deepEqual(result.data.messages, []);
  });

  test("conversation not found is still reported distinctly — a missing conversation is not a context failure", async () => {
    const result = await loadConversationLikeTheRealHandler(
      "user-1",
      null,
      [],
      brokenHealthMetricsSource,
    );
    assert.deepEqual(result, { status: "error", error: { code: "NOT_FOUND", retryable: false } });
  });

  test("retry after the underlying source recovers returns the real context, not just the degraded flag", async () => {
    const first = await loadConversationLikeTheRealHandler(
      "user-1",
      conversation(),
      [],
      brokenHealthMetricsSource,
    );
    assert.equal(first.status, "success");
    if (first.status === "success") {
      assert.deepEqual(first.data.contextFlags, [{ key: "contextSharing", state: "limited" }]);
    }

    const retried = await loadConversationLikeTheRealHandler(
      "user-1",
      conversation(),
      [],
      workingSource,
    );
    assert.equal(retried.status, "success");
    if (retried.status === "success") {
      assert.notDeepEqual(retried.data.contextFlags, [{ key: "contextSharing", state: "limited" }]);
    }
  });

  test("this load path never invokes an AI provider — a provider outage cannot affect it by construction", async () => {
    // No generateResponse/OpenAI dependency exists anywhere in
    // loadConversationLikeTheRealHandler's signature or body, matching the
    // real handler: getAdvisorConversationMessagesServer never imports
    // generate-advisor-response.server.ts. Provider calls only happen from
    // sendAdvisorMessageServer / sendPersistentAdvisorMessage.
    const result = await loadConversationLikeTheRealHandler(
      "user-1",
      conversation(),
      [],
      brokenHealthMetricsSource,
    );
    assert.equal(result.status, "success");
  });
});

describe("the real advisor-conversations.functions.ts carries this exact protection", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./advisor-conversations.functions.ts", import.meta.url)),
    "utf8",
  );

  test("getAdvisorConversationMessagesServer isolates buildAdvisorContextForUser in its own try/catch", () => {
    const handlerStart = source.indexOf("export const getAdvisorConversationMessagesServer");
    assert.notEqual(handlerStart, -1);
    const handlerEnd = source.indexOf("export const renameAdvisorConversationServer");
    const handler = source.slice(handlerStart, handlerEnd === -1 ? undefined : handlerEnd);

    assert.match(
      handler,
      /let contextFlags:/,
      "context flags are computed outside the success payload",
    );
    assert.match(
      handler,
      /try\s*\{\s*const contextResult = await buildAdvisorContextForUser\(/,
      "buildAdvisorContextForUser is called inside its own try block",
    );
    assert.match(
      handler,
      /catch \(error\) \{[\s\S]*?contextFlags = \[\{ key: "contextSharing", state: "limited" \}\];/,
      "a context-build failure degrades to a limited-context flag instead of propagating",
    );
    // The outer handler still has its own catch for genuine store/auth
    // failures — that one must keep mapping to PERSISTENCE_UNAVAILABLE, it's
    // just no longer reachable for a context-only failure.
    assert.match(handler, /catch \{\s*return unavailable\(\);\s*\}/);
  });

  test("does not import or call the OpenAI/provider response generator", () => {
    const handlerStart = source.indexOf("export const getAdvisorConversationMessagesServer");
    const handlerEnd = source.indexOf("export const renameAdvisorConversationServer");
    const handler = source.slice(handlerStart, handlerEnd === -1 ? undefined : handlerEnd);
    assert.doesNotMatch(handler, /generate-advisor-response|generateAdvisorResponse|openai/i);
  });
});
