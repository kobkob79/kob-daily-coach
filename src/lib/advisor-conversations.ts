import type { AdvisorId } from "./advisor-core/types";

export const ADVISOR_CONVERSATION_STATUSES = ["active", "archived", "deleted"] as const;
export type AdvisorConversationStatus = (typeof ADVISOR_CONVERSATION_STATUSES)[number];

export const ADVISOR_MESSAGE_STATUSES = [
  "pending_quota",
  "generating",
  "completed",
  "quota_rejected",
  "provider_failed",
  "finalize_failed",
  "interrupted",
] as const;
export type AdvisorMessageStatus = (typeof ADVISOR_MESSAGE_STATUSES)[number];

export type AdvisorMessageRole = "user" | "assistant";
export type AdvisorContextFlagState = "missing" | "stale" | "conflicting";
export type AdvisorContextFlagKey =
  | "profile"
  | "goals"
  | "bioDay"
  | "shift"
  | "nutrition"
  | "hydration"
  | "workouts"
  | "sleep"
  | "recovery"
  | "limitations";

export interface AdvisorContextFlag {
  key: AdvisorContextFlagKey;
  state: AdvisorContextFlagState;
}

export interface AdvisorConversationDto {
  id: string;
  advisorId: AdvisorId;
  title: string | null;
  status: AdvisorConversationStatus;
  isCurrent: boolean;
  lastMessageAt: string | null;
  /** Server-derived from completed persisted content, whitespace-normalized and capped at 160 chars. */
  lastMessageSnippet: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdvisorMessageDto {
  id: string;
  conversationId: string;
  turnId: string;
  retryOfMessageId: string | null;
  role: AdvisorMessageRole;
  content: string;
  status: AdvisorMessageStatus;
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
}

export interface AdvisorPageCursor {
  beforeOrdinal: string | null;
}

export interface AdvisorConversationPageCursor {
  beforeLastMessageAt: string | null;
  beforeId: string | null;
}

export interface AdvisorPage<T, TCursor> {
  items: readonly T[];
  nextCursor: TCursor | null;
}

export type AdvisorQuotaPresentation =
  | {
      mode: "daily";
      state: "available" | "exhausted";
      resetsAt: string;
    }
  | {
      mode: "unlimited";
      state: "available";
      resetsAt: null;
    };

export const ADVISOR_CONVERSATION_ERROR_CODES = [
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
] as const;
export type AdvisorConversationErrorCode = (typeof ADVISOR_CONVERSATION_ERROR_CODES)[number];

export interface AdvisorSafeError {
  code: AdvisorConversationErrorCode;
  retryable: boolean;
}

export type AdvisorOperationResult<T> =
  | { status: "success"; data: T }
  | { status: "pending"; requestId: string }
  | { status: "error"; error: AdvisorSafeError };

export type AdvisorUiRequestState<T> =
  { status: "idle" } | { status: "loading" } | AdvisorOperationResult<T>;

export interface ListAdvisorConversationsInput {
  advisorId?: AdvisorId;
  cursor?: AdvisorConversationPageCursor | null;
  limit?: number;
}

export type ListAdvisorConversationsResult = AdvisorOperationResult<
  AdvisorPage<AdvisorConversationDto, AdvisorConversationPageCursor>
>;

export interface CreateAdvisorConversationInput {
  advisorId: AdvisorId;
  title?: string;
}

export type CreateAdvisorConversationResult = AdvisorOperationResult<{
  conversation: AdvisorConversationDto;
}>;

export interface GetAdvisorConversationMessagesInput {
  conversationId: string;
  cursor?: AdvisorPageCursor | null;
  limit?: number;
}

export type GetAdvisorConversationMessagesResult = AdvisorOperationResult<{
  conversation: AdvisorConversationDto;
  messages: AdvisorPage<AdvisorMessageDto, AdvisorPageCursor>;
  contextFlags: readonly AdvisorContextFlag[];
  quota: AdvisorQuotaPresentation;
}>;

export interface RenameAdvisorConversationInput {
  conversationId: string;
  title: string;
}

export type RenameAdvisorConversationResult = AdvisorOperationResult<{
  conversation: AdvisorConversationDto;
}>;

export interface DeleteAdvisorConversationInput {
  conversationId: string;
}

export type DeleteAdvisorConversationResult = AdvisorOperationResult<{
  conversationId: string;
  deleted: true;
}>;

export interface SendAdvisorMessageInput {
  conversationId: string;
  /** Reusing this UUID in the same conversation must return the existing turn. */
  clientRequestId: string;
  message: string;
  /** Manual retries use a new clientRequestId and point to the failed user attempt. */
  retryOfMessageId?: string;
}

export type SendAdvisorMessageResult = AdvisorOperationResult<{
  conversation: AdvisorConversationDto;
  userMessage: AdvisorMessageDto;
  assistantMessage: AdvisorMessageDto | null;
  quota: AdvisorQuotaPresentation;
  contextFlags: readonly AdvisorContextFlag[];
}>;

export interface AdvisorConversationOperations {
  listAdvisorConversations(
    input: ListAdvisorConversationsInput,
  ): Promise<ListAdvisorConversationsResult>;
  createAdvisorConversation(
    input: CreateAdvisorConversationInput,
  ): Promise<CreateAdvisorConversationResult>;
  getAdvisorConversationMessages(
    input: GetAdvisorConversationMessagesInput,
  ): Promise<GetAdvisorConversationMessagesResult>;
  renameAdvisorConversation(
    input: RenameAdvisorConversationInput,
  ): Promise<RenameAdvisorConversationResult>;
  deleteAdvisorConversation(
    input: DeleteAdvisorConversationInput,
  ): Promise<DeleteAdvisorConversationResult>;
  sendAdvisorMessage(input: SendAdvisorMessageInput): Promise<SendAdvisorMessageResult>;
}

/** Server-owned history: at most six complete turns/twelve messages, oldest complete turns first. */
export const ADVISOR_HISTORY_MAX_TURNS = 6;
export const ADVISOR_HISTORY_MAX_MESSAGES = 12;
export const ADVISOR_LAST_MESSAGE_SNIPPET_MAX_LENGTH = 160;

/** Production gate: disclose per-send provider context use and obtain clear user consent. */
export const ADVISOR_CONTEXT_PRIVACY_NOTICE_REQUIRED = true;

export function normalizeAdvisorConversationSnippet(value: string): string {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return normalized.length <= ADVISOR_LAST_MESSAGE_SNIPPET_MAX_LENGTH
    ? normalized
    : `${normalized.slice(0, ADVISOR_LAST_MESSAGE_SNIPPET_MAX_LENGTH - 1)}…`;
}

export interface AdvisorHistoryMessage {
  role: AdvisorMessageRole;
  content: string;
  turnId: string;
  ordinal: number;
}

export function boundCompletedAdvisorHistory(history: readonly AdvisorHistoryMessage[]) {
  const turns = new Map<string, AdvisorHistoryMessage[]>();
  for (const message of history) {
    const turn = turns.get(message.turnId) ?? [];
    turn.push(message);
    turns.set(message.turnId, turn);
  }
  return [...turns.values()]
    .filter(
      (turn) => turn.length === 2 && turn[0]?.role === "user" && turn[1]?.role === "assistant",
    )
    .slice(-ADVISOR_HISTORY_MAX_TURNS)
    .flat()
    .slice(-ADVISOR_HISTORY_MAX_MESSAGES)
    .map(({ role, content }) => ({ role, content }));
}
