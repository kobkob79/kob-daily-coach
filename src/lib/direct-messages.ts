/**
 * 1:1 private messaging — pure draft validation and conversation-list
 * aggregation, no Supabase dependency so it's unit-testable. The route
 * components own the actual read/write calls (direct client + RLS, same
 * shape as community-posts.ts).
 */

export const DIRECT_MESSAGE_MAX_BODY_LENGTH = 2000;

export type MessageDraftValidation = { ok: true } | { ok: false; error: string };

/** Mirrors direct_messages' check constraints (not blank, body length) so a bad draft is caught before the round trip. */
export function validateMessageDraft(body: string): MessageDraftValidation {
  const trimmed = body.trim();
  if (!trimmed) {
    return { ok: false, error: "כתבו הודעה" };
  }
  // Code points, not UTF-16 units — see community-posts.ts's validatePostDraft
  // for why (matches Postgres' char_length, the actual DB constraint).
  if ([...body].length > DIRECT_MESSAGE_MAX_BODY_LENGTH) {
    return {
      ok: false,
      error: `ההודעה ארוכה מדי (עד ${DIRECT_MESSAGE_MAX_BODY_LENGTH} תווים)`,
    };
  }
  return { ok: true };
}

export interface DirectMessageRow {
  id: string;
  sender_id: string;
  sender_display_name: string;
  recipient_id: string;
  recipient_display_name: string;
  body: string;
  created_at: string;
}

export interface ConversationSummary {
  otherUserId: string;
  otherDisplayName: string;
  lastMessageBody: string;
  lastMessageAt: string;
  lastMessageMine: boolean;
}

/** Picks the id/name of whichever side of a message isn't the current user. */
export function otherParty(
  message: DirectMessageRow,
  currentUserId: string,
): { id: string; displayName: string } {
  return message.sender_id === currentUserId
    ? { id: message.recipient_id, displayName: message.recipient_display_name }
    : { id: message.sender_id, displayName: message.sender_display_name };
}

/**
 * Groups every message involving the current user into one summary per
 * conversation partner, keeping only the most recent message in each.
 * Assumes `messages` is already sorted newest-first (as every caller's query
 * does with `order("created_at", { ascending: false })`), so the first
 * occurrence of each conversation partner is already its latest message and
 * the returned array is already in "most recently active" order.
 */
export function buildConversationList(
  messages: readonly DirectMessageRow[],
  currentUserId: string,
): ConversationSummary[] {
  const seen = new Set<string>();
  const summaries: ConversationSummary[] = [];
  for (const message of messages) {
    const other = otherParty(message, currentUserId);
    if (seen.has(other.id)) continue;
    seen.add(other.id);
    summaries.push({
      otherUserId: other.id,
      otherDisplayName: other.displayName,
      lastMessageBody: message.body,
      lastMessageAt: message.created_at,
      lastMessageMine: message.sender_id === currentUserId,
    });
  }
  return summaries;
}
