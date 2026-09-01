import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  ADVISOR_PENDING_MAX_POLLS,
  ADVISOR_PENDING_POLL_INTERVAL_MS,
  advisorConversationErrorMessage,
  createAdvisorMessagesPayload,
  createAdvisorSendPayload,
  hasGeneratingAdvisorMessage,
  mergeAdvisorMessages,
  quotaPresentationToClientState,
  removeAdvisorConversation,
  selectRestoredAdvisorConversation,
  shouldFollowLatestMessage,
  upsertAdvisorConversation,
} from "../src/lib/advisor-conversation-client.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const shell = await readFile(`${root}/src/components/coach/CoachChatShell.tsx`, "utf8");
const composer = await readFile(
  `${root}/src/components/coach/conversations/ChatComposer.tsx`,
  "utf8",
);
const contextNotice = await readFile(
  `${root}/src/components/coach/conversations/AdvisorContextNotice.tsx`,
  "utf8",
);

const conversation = (id, advisorId, isCurrent = false) => ({
  id,
  advisorId,
  title: null,
  status: "active",
  isCurrent,
  lastMessageAt: null,
  lastMessageSnippet: null,
  createdAt: "2026-08-29T08:00:00.000Z",
  updatedAt: "2026-08-29T08:00:00.000Z",
});
const message = (id, status = "completed") => ({
  id,
  conversationId: "conversation-1",
  turnId: `turn-${id}`,
  retryOfMessageId: null,
  role: "user",
  content: id,
  status,
  createdAt: "2026-08-29T08:00:00.000Z",
  completedAt: status === "completed" ? "2026-08-29T08:00:01.000Z" : null,
  failedAt: null,
});

// Restoration after remount prefers a previously selected, server-returned conversation.
const conversations = [
  conversation("daniel-current", "daniel", true),
  conversation("daniel-stored", "daniel"),
  conversation("maya-current", "maya", true),
];
assert.equal(
  selectRestoredAdvisorConversation(conversations, "daniel", "daniel-stored")?.id,
  "daniel-stored",
);
assert.equal(
  selectRestoredAdvisorConversation(conversations, "daniel", "unknown")?.id,
  "daniel-current",
);
assert.equal(selectRestoredAdvisorConversation(conversations, "adam", "maya-current"), null);

const created = conversation("daniel-new", "daniel", true);
assert.deepEqual(
  upsertAdvisorConversation(conversations, created).map(({ id }) => id),
  ["daniel-new", "daniel-current", "daniel-stored", "maya-current"],
);
const renamed = { ...created, title: "שם חדש" };
assert.equal(upsertAdvisorConversation([created], renamed)[0]?.title, "שם חדש");
assert.deepEqual(removeAdvisorConversation([created, ...conversations], created.id), conversations);

// Persisted pages merge without duplicates, including repeated network delivery.
assert.deepEqual(
  mergeAdvisorMessages([message("one")], [message("one"), message("two")]).map(({ id }) => id),
  ["one", "two"],
);
assert.deepEqual(
  mergeAdvisorMessages([message("new")], [message("old")], true).map(({ id }) => id),
  ["old", "new"],
);

assert.equal(hasGeneratingAdvisorMessage([message("pending", "generating")]), true);
assert.equal(hasGeneratingAdvisorMessage([message("done")]), false);
assert.equal(ADVISOR_PENDING_POLL_INTERVAL_MS, 1_500);
assert.equal(ADVISOR_PENDING_MAX_POLLS, 40);

assert.equal(
  quotaPresentationToClientState({ mode: "unlimited", state: "available", resetsAt: null }),
  "unlimited",
);
assert.equal(
  quotaPresentationToClientState({
    mode: "daily",
    state: "exhausted",
    resetsAt: "2026-08-30T00:00:00.000Z",
  }),
  "exhausted",
);
assert.doesNotMatch(advisorConversationErrorMessage("PROVIDER_UNAVAILABLE"), /OpenAI|provider/i);
assert.match(advisorConversationErrorMessage("PERSISTENCE_UNAVAILABLE"), /שיחות אינן זמינות/);

// The only send inputs are server-contract fields; trusted state is never client supplied.
const requestId = "11111111-1111-4111-8111-111111111111";
const retryRequestId = "22222222-2222-4222-8222-222222222222";
assert.deepEqual(
  Object.keys(
    createAdvisorSendPayload({
      conversationId: "33333333-3333-4333-8333-333333333333",
      clientRequestId: requestId,
      message: "hello",
    }),
  ).sort(),
  ["clientRequestId", "conversationId", "message"],
);
assert.deepEqual(
  createAdvisorSendPayload({
    conversationId: "33333333-3333-4333-8333-333333333333",
    clientRequestId: retryRequestId,
    message: "hello",
    retryOfMessageId: "44444444-4444-4444-8444-444444444444",
  }).clientRequestId,
  retryRequestId,
);
assert.deepEqual(createAdvisorMessagesPayload("conversation-1"), {
  conversationId: "conversation-1",
  cursor: null,
  limit: 100,
});

assert.equal(shouldFollowLatestMessage(48), true);
assert.equal(shouldFollowLatestMessage(240), false);

for (const operation of [
  "listAdvisorConversationsServer",
  "createAdvisorConversationServer",
  "getAdvisorConversationMessagesServer",
  "renameAdvisorConversationServer",
  "deleteAdvisorConversationServer",
  "sendAdvisorMessageServer",
])
  assert.match(shell, new RegExp(operation));

assert.match(shell, /window\.localStorage\.getItem/);
assert.match(shell, /result\.data\.conversation\.advisorId !== advisor\.id/);
assert.match(shell, /result\.status === "pending"/);
assert.match(shell, /pollPendingTurn/);
assert.match(shell, /DAILY_QUOTA_EXCEEDED/);
assert.match(shell, /PROVIDER_UNAVAILABLE|advisorConversationErrorMessage/);
assert.match(shell, /retryOfMessageId/);
assert.match(shell, /crypto\.randomUUID\(\)/);
assert.doesNotMatch(shell, /generateAdvisorResponseServer|getAdvisorDailyQuotaServer/);

const sendCalls = [...shell.matchAll(/sendAdvisorMessageServer\(\{([\s\S]*?)\n\s*\}\);/g)];
assert.ok(sendCalls.length >= 1);
for (const [, call] of sendCalls) {
  assert.doesNotMatch(call, /userId|isAdmin|history|contextFlags|quotaState|service_role/);
}

// Mobile/RTL and accessibility assumptions remain explicit and bounded.
assert.match(shell, /dir="rtl"/);
assert.match(shell, /overflow-x-hidden/);
assert.match(shell, /min-w-0/);
assert.match(shell, /w-\[min\(88vw,24rem\)\]/);
assert.match(shell, /aria-label={`פתיחת רשימת השיחות/);
assert.match(composer, /flex shrink-0 gap-2/);
assert.doesNotMatch(composer, /sticky bottom-/);
assert.match(composer, /aria-label="הודעה ליועץ"/);

// Context states are rendered explicitly rather than collapsed into a generic warning.
for (const state of ["missing", "stale", "conflicting"]) {
  assert.match(contextNotice, new RegExp(`${state}:`));
}

console.log(
  "Advisor conversation integration regression: PASS (restore, CRUD, send, pending, quota, retry, security, RTL/a11y)",
);
