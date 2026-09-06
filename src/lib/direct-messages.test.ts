/**
 * Regression tests for direct-messages.ts.
 * Run with: node --test src/lib/direct-messages.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECT_MESSAGE_MAX_BODY_LENGTH,
  buildConversationList,
  otherParty,
  validateMessageDraft,
  type DirectMessageRow,
} from "./direct-messages.ts";

const ME = "11111111-0000-0000-0000-000000000000";
const DANA = "22222222-0000-0000-0000-000000000000";
const YOSSI = "33333333-0000-0000-0000-000000000000";

function message(overrides: Partial<DirectMessageRow>): DirectMessageRow {
  return {
    id: "m",
    sender_id: ME,
    sender_display_name: "קובי",
    recipient_id: DANA,
    recipient_display_name: "דנה",
    body: "היי",
    created_at: "2026-09-06T00:00:00.000Z",
    ...overrides,
  };
}

test("validateMessageDraft rejects a blank body", () => {
  const result = validateMessageDraft("   ");
  assert.equal(result.ok, false);
});

test("validateMessageDraft accepts a normal body", () => {
  assert.deepEqual(validateMessageDraft("מה נשמע?"), { ok: true });
});

test("validateMessageDraft rejects a body over the length cap", () => {
  const result = validateMessageDraft("א".repeat(DIRECT_MESSAGE_MAX_BODY_LENGTH + 1));
  assert.equal(result.ok, false);
});

test("validateMessageDraft accepts a body exactly at the length cap", () => {
  const result = validateMessageDraft("א".repeat(DIRECT_MESSAGE_MAX_BODY_LENGTH));
  assert.equal(result.ok, true);
});

test("otherParty returns the recipient when the current user is the sender", () => {
  assert.deepEqual(otherParty(message({}), ME), { id: DANA, displayName: "דנה" });
});

test("otherParty returns the sender when the current user is the recipient", () => {
  assert.deepEqual(otherParty(message({}), DANA), { id: ME, displayName: "קובי" });
});

test("buildConversationList keeps only the latest message per partner", () => {
  const messages = [
    message({ id: "3", created_at: "2026-09-06T12:00:00.000Z", body: "אחרון" }),
    message({ id: "2", created_at: "2026-09-06T11:00:00.000Z", body: "אמצעי" }),
    message({ id: "1", created_at: "2026-09-06T10:00:00.000Z", body: "ראשון" }),
  ];
  const summaries = buildConversationList(messages, ME);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.lastMessageBody, "אחרון");
  assert.equal(summaries[0]?.otherUserId, DANA);
});

test("buildConversationList separates different partners and preserves recency order", () => {
  const messages = [
    message({
      id: "1",
      created_at: "2026-09-06T12:00:00.000Z",
      recipient_id: YOSSI,
      recipient_display_name: "יוסי",
    }),
    message({
      id: "2",
      created_at: "2026-09-06T11:00:00.000Z",
      recipient_id: DANA,
      recipient_display_name: "דנה",
    }),
  ];
  const summaries = buildConversationList(messages, ME);
  assert.deepEqual(
    summaries.map((s) => s.otherUserId),
    [YOSSI, DANA],
  );
});

test("buildConversationList marks lastMessageMine correctly for both directions", () => {
  const mine = message({ sender_id: ME, recipient_id: DANA });
  const theirs = message({
    sender_id: DANA,
    sender_display_name: "דנה",
    recipient_id: ME,
    recipient_display_name: "קובי",
  });
  assert.equal(buildConversationList([mine], ME)[0]?.lastMessageMine, true);
  assert.equal(buildConversationList([theirs], ME)[0]?.lastMessageMine, false);
});
