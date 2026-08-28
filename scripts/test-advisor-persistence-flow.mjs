import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { boundCompletedAdvisorHistory } from "../src/lib/advisor-conversations.ts";
import { sendPersistentAdvisorMessage } from "../src/lib/advisor-core/server/advisor-conversation-flow.server.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const functions = await readFile(`${root}/src/lib/advisor-conversations.functions.ts`, "utf8");
const flow = await readFile(
  `${root}/src/lib/advisor-core/server/advisor-conversation-flow.server.ts`,
  "utf8",
);
const provider = await readFile(
  `${root}/src/lib/advisor-core/server/providers/openai-provider.server.ts`,
  "utf8",
);

for (const name of [
  "listAdvisorConversationsServer",
  "createAdvisorConversationServer",
  "getAdvisorConversationMessagesServer",
  "renameAdvisorConversationServer",
  "deleteAdvisorConversationServer",
  "sendAdvisorMessageServer",
])
  assert.match(functions, new RegExp(`export const ${name}`));
assert.match(functions, /middleware\(\[requireSupabaseAuth\]\)/g);
assert.doesNotMatch(functions, /userId:\s*z\.|history:\s*z\.|isAdmin:\s*z\./);
assert.match(flow, /clientRequestId/);
assert.match(flow, /quotaStore\.claim/);
assert.match(flow, /completeTurn/);
assert.match(flow, /failTurn/);
assert.match(flow, /createSupabaseAdvisorContextDataSource\(dependencies\.supabase\)/);
assert.match(provider, /store: false/);
assert.match(provider, /history\.map/);
assert.match(provider, /Viora server context/);

const history = Array.from({ length: 8 }, (_, turn) => [
  { role: "user", content: `u${turn}`, turnId: `t${turn}`, ordinal: turn * 2 + 1 },
  { role: "assistant", content: `a${turn}`, turnId: `t${turn}`, ordinal: turn * 2 + 2 },
]).flat();
const bounded = boundCompletedAdvisorHistory(history);
assert.equal(bounded.length, 12);
assert.equal(bounded[0].content, "u2");
assert.equal(bounded.at(-1).content, "a7");
assert.deepEqual(
  boundCompletedAdvisorHistory([
    ...history,
    { role: "user", content: "partial", turnId: "partial", ordinal: 99 },
  ]),
  bounded,
);

function fixture({ allowed = true, admin = false, providerFails = false } = {}) {
  const now = "2026-08-28T12:00:00.000Z";
  const conversation = {
    id: "conversation-1",
    user_id: "user-1",
    advisor_id: "daniel",
    title: null,
    status: "active",
    is_current: true,
    last_message_at: null,
    created_at: now,
    updated_at: now,
  };
  const requests = new Map();
  const assistants = new Map();
  const events = { claims: 0, providerCalls: 0, failures: [], completions: 0 };
  let sequence = 0;
  const store = {
    async findOwned(userId, conversationId) {
      return userId === conversation.user_id && conversationId === conversation.id
        ? conversation
        : null;
    },
    async beginTurn(input) {
      const existing = requests.get(input.clientRequestId);
      if (existing) return { created: false, message: existing };
      const message = {
        id: `user-${++sequence}`,
        conversation_id: input.conversationId,
        user_id: input.userId,
        turn_id: `turn-${sequence}`,
        client_request_id: input.clientRequestId,
        retry_of_message_id: input.retryOfMessageId ?? null,
        role: "user",
        content: input.message,
        status: "pending_quota",
        ordinal: sequence,
        created_at: now,
        completed_at: null,
        failed_at: null,
      };
      requests.set(input.clientRequestId, message);
      return { created: true, message };
    },
    async markGenerating(_userId, messageId) {
      for (const message of requests.values())
        if (message.id === messageId) message.status = "generating";
    },
    async completedHistory() {
      return history;
    },
    async completeTurn(input) {
      events.completions += 1;
      const user = [...requests.values()].find((message) => message.id === input.userMessageId);
      user.status = "completed";
      user.completed_at = now;
      const assistant = {
        id: input.assistantMessageId,
        conversation_id: conversation.id,
        user_id: "user-1",
        turn_id: user.turn_id,
        client_request_id: null,
        retry_of_message_id: null,
        role: "assistant",
        content: input.content,
        status: "completed",
        ordinal: 100,
        created_at: now,
        completed_at: now,
        failed_at: null,
      };
      assistants.set(user.turn_id, assistant);
      return {
        id: assistant.id,
        conversationId: assistant.conversation_id,
        turnId: assistant.turn_id,
        retryOfMessageId: null,
        role: "assistant",
        content: assistant.content,
        status: "completed",
        createdAt: now,
        completedAt: now,
        failedAt: null,
      };
    },
    async failTurn(_userId, messageId, claimToken, status) {
      events.failures.push({ messageId, claimToken, status });
      const user = [...requests.values()].find((message) => message.id === messageId);
      user.status = status;
    },
    async assistantForTurn(_userId, _conversationId, turnId) {
      return assistants.get(turnId) ?? null;
    },
  };
  const quotaStore = {
    async getStatus() {
      return {
        allowed,
        used: allowed ? 0 : 1,
        limit: 1,
        remaining: allowed ? 1 : 0,
        resets_at: "2026-08-29T00:00:00Z",
      };
    },
    async claim() {
      events.claims += 1;
      return { claimToken: "claim-1", quota: await this.getStatus() };
    },
    async finalize() {
      throw new Error("flow must finalize atomically through completeTurn");
    },
    async release() {},
  };
  const dependencies = {
    conversationStore: store,
    quotaStore,
    supabase: {},
    quotaExempt: admin,
    async buildContext(userId, advisorId) {
      assert.equal(userId, "user-1");
      assert.equal(advisorId, "daniel");
      return {
        context: {
          userId,
          generatedAt: now,
          facts: {
            workouts: {
              state: "missing",
              value: null,
              observedAt: null,
              sources: [],
              confidence: "unknown",
            },
          },
        },
        contextFlags: [{ key: "workouts", state: "missing" }],
      };
    },
    async generateResponse(_request, options) {
      events.providerCalls += 1;
      assert.equal(options.history.length, 12);
      assert.equal("userId" in options.context, false);
      if (providerFails) throw new Error("synthetic provider failure");
      return {
        advisor_id: "daniel",
        response_id: "response-1",
        text: "answer",
        provider_metadata: { provider: "mock", model: "test" },
      };
    },
  };
  return { dependencies, events };
}

const input = {
  conversationId: "conversation-1",
  clientRequestId: "11111111-1111-4111-8111-111111111111",
  message: "question",
};
const success = fixture();
const first = await sendPersistentAdvisorMessage("user-1", "daniel", input, success.dependencies);
assert.equal(first.status, "success");
const duplicate = await sendPersistentAdvisorMessage(
  "user-1",
  "daniel",
  input,
  success.dependencies,
);
assert.equal(duplicate.status, "success");
assert.equal(success.events.claims, 1);
assert.equal(success.events.providerCalls, 1);
assert.equal(success.events.completions, 1);

const concurrent = fixture();
const concurrentResults = await Promise.all([
  sendPersistentAdvisorMessage("user-1", "daniel", input, concurrent.dependencies),
  sendPersistentAdvisorMessage("user-1", "daniel", input, concurrent.dependencies),
]);
assert.deepEqual(concurrentResults.map((result) => result.status).sort(), ["pending", "success"]);
assert.equal(concurrent.events.providerCalls, 1);

const exhausted = fixture({ allowed: false });
const exhaustedResult = await sendPersistentAdvisorMessage(
  "user-1",
  "daniel",
  input,
  exhausted.dependencies,
);
assert.equal(exhaustedResult.status, "error");
assert.equal(exhaustedResult.error.code, "DAILY_QUOTA_EXCEEDED");
assert.equal(exhausted.events.providerCalls, 0);

const failed = fixture({ providerFails: true });
const failedResult = await sendPersistentAdvisorMessage(
  "user-1",
  "daniel",
  input,
  failed.dependencies,
);
assert.equal(failedResult.status, "error");
assert.deepEqual(failed.events.failures[0], {
  messageId: "user-1",
  claimToken: "claim-1",
  status: "provider_failed",
});

const admin = fixture({ admin: true });
assert.equal(
  (await sendPersistentAdvisorMessage("user-1", "daniel", input, admin.dependencies)).status,
  "success",
);
assert.equal(admin.events.claims, 0);

const wrongOwner = fixture();
const wrongOwnerResult = await sendPersistentAdvisorMessage(
  "user-2",
  "daniel",
  input,
  wrongOwner.dependencies,
);
assert.equal(wrongOwnerResult.status, "error");
assert.equal(wrongOwnerResult.error.code, "NOT_FOUND");
assert.equal(wrongOwner.events.claims, 0);

console.log(
  "Advisor persistence flow regression: PASS (auth boundary, idempotency hooks, quota lifecycle, 6-turn history, store:false)",
);
