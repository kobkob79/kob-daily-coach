import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  ADVISOR_CONVERSATION_ERROR_CODES,
  ADVISOR_CONVERSATION_STATUSES,
  ADVISOR_HISTORY_MAX_MESSAGES,
  ADVISOR_HISTORY_MAX_TURNS,
  ADVISOR_LAST_MESSAGE_SNIPPET_MAX_LENGTH,
  ADVISOR_MESSAGE_STATUSES,
  ADVISOR_CONTEXT_PRIVACY_NOTICE_REQUIRED,
} from "../src/lib/advisor-conversations.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const migration = await readFile(
  `${root}/supabase/migrations/20260828151750_advisor_conversations.sql`,
  "utf8",
);
const contract = await readFile(`${root}/src/lib/advisor-conversations.ts`, "utf8");

assert.match(migration, /create table public\.advisor_conversations/);
assert.match(migration, /create table public\.advisor_messages/);
assert.match(migration, /alter table public\.advisor_conversations enable row level security/);
assert.match(migration, /alter table public\.advisor_messages enable row level security/);
assert.match(
  migration,
  /revoke all on table public\.advisor_conversations from public, anon, authenticated/,
);
assert.match(
  migration,
  /revoke all on table public\.advisor_messages from public, anon, authenticated/,
);
assert.match(migration, /grant select on table public\.advisor_conversations to authenticated/);
assert.match(migration, /grant select on table public\.advisor_messages to authenticated/);
assert.match(
  migration,
  /grant select, insert, update, delete on table public\.advisor_conversations to service_role/,
);
assert.match(
  migration,
  /grant select, insert, update, delete on table public\.advisor_messages to service_role/,
);
assert.doesNotMatch(migration, /grant (?:insert|update|delete)[^;]*authenticated/i);
assert.match(migration, /to authenticated\s+using \(\(select auth\.uid\(\)\) = user_id\)/g);
assert.doesNotMatch(migration, /auth\.role\(/);
assert.doesNotMatch(migration, /security definer/i);
assert.doesNotMatch(migration, /user_metadata|raw_user_meta_data/i);

assert.match(migration, /advisor_conversations_one_current_per_advisor/);
assert.match(migration, /where is_current and deleted_at is null/);
assert.match(migration, /status = 'deleted' and deleted_at is not null and is_current = false/);
assert.match(migration, /advisor_messages_client_request_idempotency_idx/);
assert.match(migration, /\(conversation_id, client_request_id\)/);
assert.match(migration, /advisor_messages_conversation_ordinal_idx/);
assert.match(migration, /protect_advisor_conversation_ownership/);
assert.match(migration, /new\.user_id is distinct from old\.user_id/);
assert.match(migration, /enforce_advisor_message_owner/);
assert.match(migration, /retried\.conversation_id = new\.conversation_id/);
assert.match(migration, /retried\.user_id = new\.user_id/);
assert.match(
  migration,
  /retried\.status in \('provider_failed', 'finalize_failed', 'interrupted'\)/,
);
assert.match(migration, /advisor_id in \('adam', 'daniel', 'maya', 'shiran'\)/);
assert.match(migration, /create or replace function public\.complete_advisor_turn/);
assert.match(migration, /returns public\.advisor_messages/);
assert.match(migration, /conversation\.status = 'active'/);
assert.match(migration, /for update of message, conversation/);
assert.match(migration, /return v_assistant/);
assert.match(migration, /create or replace function public\.fail_advisor_turn/);
assert.match(migration, /create or replace function public\.create_advisor_conversation/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /successful_questions = 1/);
assert.match(migration, /reservation_token = null/);
assert.match(migration, /to service_role/g);

assert.deepEqual(ADVISOR_CONVERSATION_STATUSES, ["active", "archived", "deleted"]);
assert.deepEqual(ADVISOR_MESSAGE_STATUSES, [
  "pending_quota",
  "generating",
  "completed",
  "quota_rejected",
  "provider_failed",
  "finalize_failed",
  "interrupted",
]);
assert.deepEqual(ADVISOR_CONVERSATION_ERROR_CODES, [
  "UNAUTHENTICATED",
  "INVALID_REQUEST",
  "NOT_FOUND",
  "MESSAGE_TOO_LONG",
  "DAILY_QUOTA_EXCEEDED",
  "QUOTA_UNAVAILABLE",
  "REQUEST_IN_PROGRESS",
  "RETRY_NOT_ALLOWED",
  "PROVIDER_UNAVAILABLE",
  "PERSISTENCE_UNAVAILABLE",
]);
assert.equal(ADVISOR_HISTORY_MAX_TURNS, 6);
assert.equal(ADVISOR_HISTORY_MAX_MESSAGES, 12);
assert.equal(ADVISOR_LAST_MESSAGE_SNIPPET_MAX_LENGTH, 160);
assert.equal(ADVISOR_CONTEXT_PRIVACY_NOTICE_REQUIRED, true);

for (const operation of [
  "listAdvisorConversations",
  "createAdvisorConversation",
  "getAdvisorConversationMessages",
  "renameAdvisorConversation",
  "deleteAdvisorConversation",
  "sendAdvisorMessage",
]) {
  assert.match(contract, new RegExp(`${operation}\\(`));
}

const inputBlocks = [...contract.matchAll(/export interface \w+Input \{([\s\S]*?)\n\}/g)].map(
  (match) => match[1],
);
assert.ok(inputBlocks.length >= 6);
for (const block of inputBlocks) {
  assert.doesNotMatch(block, /\buser_?id\b/i);
  assert.doesNotMatch(block, /\bhistory\b/i);
}
assert.match(contract, /clientRequestId: string/);
assert.match(contract, /retryOfMessageId\?: string/);
assert.match(contract, /type AdvisorContextFlagState = "missing" \| "stale" \| "conflicting"/);
assert.doesNotMatch(contract, /API_KEY|service_role|Authorization|secret/i);

console.log(
  "Advisor conversation foundation regression: PASS (schema, RLS, grants, ownership, idempotency, contract, privacy)",
);
