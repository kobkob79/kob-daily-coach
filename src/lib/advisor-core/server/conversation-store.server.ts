import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  normalizeAdvisorConversationSnippet,
  type AdvisorConversationDto,
  type AdvisorConversationPageCursor,
  type AdvisorMessageDto,
  type AdvisorPageCursor,
} from "@/lib/advisor-conversations";
import type { AdvisorId } from "../types";

export class AdvisorConversationNotFoundError extends Error {
  constructor() {
    super("NOT_FOUND");
    this.name = "AdvisorConversationNotFoundError";
  }
}

export class AdvisorPersistenceError extends Error {
  constructor() {
    super("PERSISTENCE_UNAVAILABLE");
    this.name = "AdvisorPersistenceError";
  }
}

interface ConversationRow {
  id: string;
  user_id: string;
  advisor_id: AdvisorId;
  title: string | null;
  status: "active" | "archived" | "deleted";
  is_current: boolean;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  turn_id: string;
  client_request_id: string | null;
  retry_of_message_id: string | null;
  role: "user" | "assistant";
  content: string;
  status: AdvisorMessageDto["status"];
  ordinal: number | string;
  created_at: string;
  completed_at: string | null;
  failed_at: string | null;
}

export interface BeginAdvisorTurnInput {
  conversationId: string;
  userId: string;
  clientRequestId: string;
  message: string;
  retryOfMessageId?: string;
}

export interface BeginAdvisorTurnResult {
  created: boolean;
  message: MessageRow;
}

export interface CompleteAdvisorTurnInput {
  userId: string;
  userMessageId: string;
  assistantMessageId: string;
  claimToken: string | null;
  content: string;
  provider: string;
  model: string;
  providerResponseId: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
  };
}

export interface AdvisorConversationStore {
  list(
    userId: string,
    input: { advisorId?: AdvisorId; cursor?: AdvisorConversationPageCursor | null; limit: number },
  ): Promise<{ items: AdvisorConversationDto[]; nextCursor: AdvisorConversationPageCursor | null }>;
  create(
    userId: string,
    advisorId: AdvisorId,
    title: string | null,
  ): Promise<AdvisorConversationDto>;
  findOwned(userId: string, conversationId: string): Promise<ConversationRow | null>;
  listMessages(
    userId: string,
    conversationId: string,
    cursor: AdvisorPageCursor | null | undefined,
    limit: number,
  ): Promise<{ items: AdvisorMessageDto[]; nextCursor: AdvisorPageCursor | null }>;
  rename(userId: string, conversationId: string, title: string): Promise<AdvisorConversationDto>;
  softDelete(userId: string, conversationId: string): Promise<void>;
  beginTurn(input: BeginAdvisorTurnInput): Promise<BeginAdvisorTurnResult>;
  isEligibleRetry(
    userId: string,
    conversationId: string,
    retryOfMessageId: string,
    clientRequestId: string,
  ): Promise<boolean>;
  markGenerating(userId: string, userMessageId: string): Promise<void>;
  completeTurn(input: CompleteAdvisorTurnInput): Promise<AdvisorMessageDto>;
  failTurn(
    userId: string,
    userMessageId: string,
    claimToken: string | null,
    status: "quota_rejected" | "provider_failed" | "finalize_failed" | "interrupted",
    safeErrorCategory: string,
  ): Promise<void>;
  completedHistory(
    userId: string,
    conversationId: string,
    maxMessages: number,
  ): Promise<
    Array<{ role: "user" | "assistant"; content: string; turnId: string; ordinal: number }>
  >;
  assistantForTurn(
    userId: string,
    conversationId: string,
    turnId: string,
  ): Promise<MessageRow | null>;
}

export function normalizeAdvisorTitle(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function normalizeAdvisorSnippet(value: string): string {
  return normalizeAdvisorConversationSnippet(value);
}

function conversationDto(
  row: ConversationRow,
  snippet: string | null = null,
): AdvisorConversationDto {
  return {
    id: row.id,
    advisorId: row.advisor_id,
    title: row.title,
    status: row.status,
    isCurrent: row.is_current,
    lastMessageAt: row.last_message_at,
    lastMessageSnippet: snippet,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function messageDto(row: MessageRow): AdvisorMessageDto {
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

function client(): SupabaseClient {
  return supabaseAdmin as unknown as SupabaseClient;
}

async function requireMutation<T>(result: { data: T | null; error: unknown }): Promise<T> {
  if (result.error || result.data == null) throw new AdvisorPersistenceError();
  return result.data;
}

export const supabaseAdvisorConversationStore: AdvisorConversationStore = {
  async list(userId, input) {
    let query = client()
      .from("advisor_conversations")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(input.limit + 1);
    if (input.advisorId) query = query.eq("advisor_id", input.advisorId);
    if (input.cursor?.beforeLastMessageAt && input.cursor.beforeId) {
      query = query.or(
        `last_message_at.lt.${input.cursor.beforeLastMessageAt},and(last_message_at.eq.${input.cursor.beforeLastMessageAt},id.lt.${input.cursor.beforeId})`,
      );
    }
    const { data, error } = await query;
    if (error) throw new AdvisorPersistenceError();
    const rows = (data ?? []) as ConversationRow[];
    const page = rows.slice(0, input.limit);
    const ids = page.map((row) => row.id);
    const snippets = new Map<string, string>();
    if (ids.length) {
      const result = await client()
        .from("advisor_messages")
        .select("conversation_id,content,ordinal")
        .in("conversation_id", ids)
        .eq("status", "completed")
        .order("ordinal", { ascending: false });
      if (result.error) throw new AdvisorPersistenceError();
      for (const message of (result.data ?? []) as Pick<
        MessageRow,
        "conversation_id" | "content" | "ordinal"
      >[]) {
        if (!snippets.has(message.conversation_id)) {
          snippets.set(message.conversation_id, normalizeAdvisorSnippet(message.content));
        }
      }
    }
    const last = page.at(-1);
    return {
      items: page.map((row) => conversationDto(row, snippets.get(row.id) ?? null)),
      nextCursor:
        rows.length > input.limit && last?.last_message_at
          ? { beforeLastMessageAt: last.last_message_at, beforeId: last.id }
          : null,
    };
  },

  async create(userId, advisorId, title) {
    const result = await client().rpc("create_advisor_conversation", {
      p_id: randomUUID(),
      p_user_id: userId,
      p_advisor_id: advisorId,
      p_title: title,
    });
    return conversationDto((await requireMutation(result)) as ConversationRow);
  },

  async findOwned(userId, conversationId) {
    const { data, error } = await client()
      .from("advisor_conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new AdvisorPersistenceError();
    return (data as ConversationRow | null) ?? null;
  },

  async listMessages(userId, conversationId, cursor, limit) {
    let query = client()
      .from("advisor_messages")
      .select("*")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .neq("status", "quota_rejected")
      .order("ordinal", { ascending: false })
      .limit(limit + 1);
    if (cursor?.beforeOrdinal) query = query.lt("ordinal", cursor.beforeOrdinal);
    const { data, error } = await query;
    if (error) throw new AdvisorPersistenceError();
    const rows = (data ?? []) as MessageRow[];
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.reverse().map(messageDto),
      nextCursor: rows.length > limit && last ? { beforeOrdinal: String(last.ordinal) } : null,
    };
  },

  async rename(userId, conversationId, title) {
    const result = await client()
      .from("advisor_conversations")
      .update({ title })
      .eq("id", conversationId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (result.error) throw new AdvisorPersistenceError();
    if (!result.data) throw new AdvisorConversationNotFoundError();
    return conversationDto(result.data as ConversationRow);
  },

  async softDelete(userId, conversationId) {
    const result = await client()
      .from("advisor_conversations")
      .update({ status: "deleted", is_current: false, deleted_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (result.error) throw new AdvisorPersistenceError();
    if (!result.data) throw new AdvisorConversationNotFoundError();
  },

  async beginTurn(input) {
    const messageId = randomUUID();
    const turnId = randomUUID();
    const result = await client()
      .from("advisor_messages")
      .insert({
        id: messageId,
        conversation_id: input.conversationId,
        user_id: input.userId,
        turn_id: turnId,
        client_request_id: input.clientRequestId,
        retry_of_message_id: input.retryOfMessageId ?? null,
        role: "user",
        content: input.message,
        status: "pending_quota",
      })
      .select("*")
      .single();
    if (!result.error && result.data) {
      return { created: true, message: result.data as MessageRow };
    }
    const errorCode = (result.error as { code?: string } | null)?.code;
    if (errorCode !== "23505") throw new AdvisorPersistenceError();
    const existing = await client()
      .from("advisor_messages")
      .select("*")
      .eq("conversation_id", input.conversationId)
      .eq("user_id", input.userId)
      .eq("client_request_id", input.clientRequestId)
      .maybeSingle();
    if (existing.error || !existing.data) throw new AdvisorPersistenceError();
    return { created: false, message: existing.data as MessageRow };
  },

  async isEligibleRetry(userId, conversationId, retryOfMessageId, clientRequestId) {
    const { data, error } = await client()
      .from("advisor_messages")
      .select("id")
      .eq("id", retryOfMessageId)
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .eq("role", "user")
      .in("status", ["provider_failed", "finalize_failed", "interrupted"])
      .neq("client_request_id", clientRequestId)
      .maybeSingle();
    if (error) throw new AdvisorPersistenceError();
    return data !== null;
  },

  async markGenerating(userId, userMessageId) {
    const result = await client()
      .from("advisor_messages")
      .update({ status: "generating" })
      .eq("id", userMessageId)
      .eq("user_id", userId)
      .eq("status", "pending_quota")
      .select("id")
      .maybeSingle();
    if (result.error || !result.data) throw new AdvisorPersistenceError();
  },

  async completeTurn(input) {
    const result = await client().rpc("complete_advisor_turn", {
      p_user_id: input.userId,
      p_user_message_id: input.userMessageId,
      p_assistant_message_id: input.assistantMessageId,
      p_claim_token: input.claimToken,
      p_content: input.content,
      p_provider: input.provider,
      p_model: input.model,
      p_provider_response_id: input.providerResponseId,
      p_input_tokens: input.usage?.inputTokens ?? null,
      p_output_tokens: input.usage?.outputTokens ?? null,
      p_reasoning_tokens: input.usage?.reasoningTokens ?? null,
      p_total_tokens: input.usage?.totalTokens ?? null,
    });
    return messageDto((await requireMutation(result)) as MessageRow);
  },

  async failTurn(userId, userMessageId, claimToken, status, safeErrorCategory) {
    const { error } = await client().rpc("fail_advisor_turn", {
      p_user_id: userId,
      p_user_message_id: userMessageId,
      p_claim_token: claimToken,
      p_status: status,
      p_safe_error_category: safeErrorCategory,
    });
    if (error) throw new AdvisorPersistenceError();
  },

  async completedHistory(userId, conversationId, maxMessages) {
    const { data, error } = await client()
      .from("advisor_messages")
      .select("role,content,turn_id,ordinal")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .eq("status", "completed")
      .order("ordinal", { ascending: false })
      .limit(maxMessages);
    if (error) throw new AdvisorPersistenceError();
    return ((data ?? []) as Array<Pick<MessageRow, "role" | "content" | "turn_id" | "ordinal">>)
      .reverse()
      .map((row) => ({
        role: row.role,
        content: row.content,
        turnId: row.turn_id,
        ordinal: Number(row.ordinal),
      }));
  },

  async assistantForTurn(userId, conversationId, turnId) {
    const { data, error } = await client()
      .from("advisor_messages")
      .select("*")
      .eq("user_id", userId)
      .eq("conversation_id", conversationId)
      .eq("turn_id", turnId)
      .eq("role", "assistant")
      .maybeSingle();
    if (error) throw new AdvisorPersistenceError();
    return (data as MessageRow | null) ?? null;
  },
};

export { conversationDto, messageDto };
