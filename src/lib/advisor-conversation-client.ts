import type {
  AdvisorConversationDto,
  AdvisorConversationErrorCode,
  AdvisorMessageDto,
  AdvisorPageCursor,
  AdvisorQuotaPresentation,
  SendAdvisorMessageInput,
} from "./advisor-conversations";
import type { AdvisorId } from "./advisor-core/types";

export type AdvisorClientQuotaState = "loading" | "available" | "unlimited" | "exhausted" | "error";

export const ADVISOR_PENDING_POLL_INTERVAL_MS = 1_500;
export const ADVISOR_PENDING_MAX_POLLS = 40;
export const ADVISOR_SCROLL_BOTTOM_THRESHOLD_PX = 96;

export function advisorConversationStorageKey(advisorId: AdvisorId): string {
  return `viora:advisor:${advisorId}:conversation`;
}

export function selectRestoredAdvisorConversation(
  conversations: readonly AdvisorConversationDto[],
  advisorId: AdvisorId,
  storedId: string | null,
): AdvisorConversationDto | null {
  const ownedAdvisorConversations = conversations.filter(
    (conversation) => conversation.advisorId === advisorId && conversation.status !== "deleted",
  );
  return (
    ownedAdvisorConversations.find((conversation) => conversation.id === storedId) ??
    ownedAdvisorConversations.find((conversation) => conversation.isCurrent) ??
    ownedAdvisorConversations[0] ??
    null
  );
}

export function mergeAdvisorMessages(
  current: readonly AdvisorMessageDto[],
  incoming: readonly AdvisorMessageDto[],
  prepend = false,
): AdvisorMessageDto[] {
  const ordered = prepend ? [...incoming, ...current] : [...current, ...incoming];
  const byId = new Map<string, AdvisorMessageDto>();
  for (const message of ordered) byId.set(message.id, message);
  return [...byId.values()];
}

export function upsertAdvisorConversation(
  current: readonly AdvisorConversationDto[],
  conversation: AdvisorConversationDto,
): AdvisorConversationDto[] {
  return [conversation, ...current.filter((item) => item.id !== conversation.id)];
}

export function removeAdvisorConversation(
  current: readonly AdvisorConversationDto[],
  conversationId: string,
): AdvisorConversationDto[] {
  return current.filter((item) => item.id !== conversationId);
}

export function hasGeneratingAdvisorMessage(messages: readonly AdvisorMessageDto[]): boolean {
  return messages.some(
    (message) => message.status === "pending_quota" || message.status === "generating",
  );
}

export function quotaPresentationToClientState(
  quota: AdvisorQuotaPresentation,
): AdvisorClientQuotaState {
  if (quota.mode === "unlimited") return "unlimited";
  return quota.state === "exhausted" ? "exhausted" : "available";
}

export function shouldFollowLatestMessage(distanceFromBottom: number): boolean {
  return distanceFromBottom <= ADVISOR_SCROLL_BOTTOM_THRESHOLD_PX;
}

export function createAdvisorSendPayload(input: {
  conversationId: string;
  clientRequestId: string;
  message: string;
  retryOfMessageId?: string;
}): SendAdvisorMessageInput {
  return input.retryOfMessageId
    ? {
        conversationId: input.conversationId,
        clientRequestId: input.clientRequestId,
        message: input.message,
        retryOfMessageId: input.retryOfMessageId,
      }
    : {
        conversationId: input.conversationId,
        clientRequestId: input.clientRequestId,
        message: input.message,
      };
}

export function createAdvisorMessagesPayload(
  conversationId: string,
  cursor: AdvisorPageCursor | null = null,
) {
  return { conversationId, cursor, limit: 100 } as const;
}

const ERROR_MESSAGES: Record<AdvisorConversationErrorCode, string> = {
  UNAUTHENTICATED: "צריך להתחבר מחדש כדי להמשיך בשיחה.",
  INVALID_REQUEST: "לא הצלחנו לשלוח את הבקשה. בדקו את ההודעה ונסו שוב.",
  NOT_FOUND: "השיחה אינה זמינה יותר.",
  MESSAGE_TOO_LONG: "ההודעה ארוכה מדי. אפשר לקצר אותה ולנסות שוב.",
  DAILY_QUOTA_EXCEEDED: "השאלה היומית נוצלה להיום. שאלה חדשה תחכה לך מחר.",
  QUOTA_UNAVAILABLE: "לא הצלחנו לבדוק את זמינות השאלה כרגע.",
  REQUEST_IN_PROGRESS: "ההודעה עדיין בטיפול. התשובה תופיע כאן מיד כשתהיה מוכנה.",
  RETRY_NOT_ALLOWED: "לא ניתן לנסות שוב את ההודעה הזו.",
  PROVIDER_UNAVAILABLE: "היועץ אינו זמין כרגע. אפשר לנסות שוב ידנית.",
  PERSISTENCE_UNAVAILABLE: "השיחות אינן זמינות כרגע. שום הודעה חדשה לא נשלחה.",
};

export function advisorConversationErrorMessage(code: AdvisorConversationErrorCode): string {
  return ERROR_MESSAGES[code];
}
