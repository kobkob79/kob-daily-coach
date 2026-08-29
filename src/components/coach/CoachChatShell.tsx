import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, History, LoaderCircle, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import {
  createAdvisorConversationServer,
  deleteAdvisorConversationServer,
  getAdvisorConversationMessagesServer,
  listAdvisorConversationsServer,
  renameAdvisorConversationServer,
  sendAdvisorMessageServer,
} from "@/lib/advisor-conversations.functions";
import {
  ADVISOR_PENDING_MAX_POLLS,
  ADVISOR_PENDING_POLL_INTERVAL_MS,
  advisorConversationErrorMessage,
  advisorConversationStorageKey,
  createAdvisorMessagesPayload,
  createAdvisorSendPayload,
  hasGeneratingAdvisorMessage,
  mergeAdvisorMessages,
  quotaPresentationToClientState,
  removeAdvisorConversation,
  selectRestoredAdvisorConversation,
  shouldFollowLatestMessage,
  upsertAdvisorConversation,
  type AdvisorClientQuotaState,
} from "@/lib/advisor-conversation-client";
import type {
  AdvisorContextFlag,
  AdvisorConversationDto,
  AdvisorConversationPageCursor,
  AdvisorMessageDto,
  AdvisorPageCursor,
} from "@/lib/advisor-conversations";
import type { CoachAdvisor } from "@/lib/coach-advisors";
import { fetchProfile, PROFILE_BUCKET } from "@/lib/profile";
import {
  AdvisorContextNotice,
  ChatComposer,
  ChatFailureState,
  ChatMessageBubble,
  ConversationList,
  ConversationSkeleton,
  DeleteConversationDialog,
  NewMessageChip,
  RenameConversationDialog,
} from "./conversations";
import { AdvisorVisual } from "./AdvisorVisual";

interface CoachChatShellProps {
  advisor: CoachAdvisor;
  userAvatarUrl?: string;
}

type ViewState = "loading" | "ready" | "error";

const introMessage = (advisor: CoachAdvisor): AdvisorMessageDto => ({
  id: `intro-${advisor.id}`,
  conversationId: `intro-${advisor.id}`,
  turnId: `intro-${advisor.id}`,
  retryOfMessageId: null,
  role: "assistant",
  content: advisor.intro,
  status: "completed",
  createdAt: "1970-01-01T00:00:00.000Z",
  completedAt: "1970-01-01T00:00:00.000Z",
  failedAt: null,
});

async function createProfileAvatarUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PROFILE_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function CoachChatShell({ advisor, userAvatarUrl }: CoachChatShellProps) {
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [conversations, setConversations] = useState<AdvisorConversationDto[]>([]);
  const [activeConversation, setActiveConversation] = useState<AdvisorConversationDto | null>(null);
  const [messages, setMessages] = useState<AdvisorMessageDto[]>([]);
  const [contextFlags, setContextFlags] = useState<readonly AdvisorContextFlag[]>([]);
  const [quotaState, setQuotaState] = useState<AdvisorClientQuotaState>("loading");
  const [conversationCursor, setConversationCursor] =
    useState<AdvisorConversationPageCursor | null>(null);
  const [messageCursor, setMessageCursor] = useState<AdvisorPageCursor | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<AdvisorConversationDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdvisorConversationDto | null>(null);
  const [showNewMessageChip, setShowNewMessageChip] = useState(false);
  const mountedRef = useRef(true);
  const requestInFlightRef = useRef(false);
  const messageViewportRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const forceFollowRef = useRef(false);

  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const profileAvatarPath = profileQuery.data?.avatar_url ?? null;
  const profileAvatarQuery = useQuery({
    queryKey: ["profile-avatar", profileAvatarPath],
    queryFn: () => createProfileAvatarUrl(profileAvatarPath!),
    enabled: !userAvatarUrl && Boolean(profileAvatarPath),
    staleTime: 50 * 60 * 1000,
  });
  const resolvedUserAvatarUrl = userAvatarUrl ?? profileAvatarQuery.data;
  const userName = profileQuery.data?.display_name ?? profileQuery.data?.full_name;

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    nearBottomRef.current = true;
    setShowNewMessageChip(false);
  }, []);

  const applyLoadedConversation = useCallback(
    async (conversation: AdvisorConversationDto) => {
      const result = await getAdvisorConversationMessagesServer({
        data: createAdvisorMessagesPayload(conversation.id),
      });
      if (!mountedRef.current) return false;
      if (result.status !== "success") {
        setOperationError(
          result.status === "error"
            ? advisorConversationErrorMessage(result.error.code)
            : "השיחה עדיין נטענת. אפשר לנסות שוב בעוד רגע.",
        );
        if (result.status === "error" && result.error.code === "PERSISTENCE_UNAVAILABLE") {
          setViewState("error");
          setQuotaState("error");
        }
        return false;
      }
      if (result.data.conversation.advisorId !== advisor.id) {
        setOperationError("השיחה אינה שייכת ליועץ הזה.");
        return false;
      }
      setActiveConversation(result.data.conversation);
      setMessages([...result.data.messages.items]);
      setMessageCursor(result.data.messages.nextCursor);
      setContextFlags(result.data.contextFlags);
      setQuotaState(quotaPresentationToClientState(result.data.quota));
      setViewState("ready");
      window.localStorage.setItem(
        advisorConversationStorageKey(advisor.id),
        result.data.conversation.id,
      );
      return true;
    },
    [advisor.id],
  );

  const loadConversationList = useCallback(
    async (preferredId?: string | null) => {
      setViewState("loading");
      setOperationError(null);
      try {
        const result = await listAdvisorConversationsServer({
          data: { advisorId: advisor.id, cursor: null, limit: 50 },
        });
        if (!mountedRef.current) return;
        if (result.status !== "success") {
          setViewState("error");
          setQuotaState("error");
          setOperationError(
            result.status === "error"
              ? advisorConversationErrorMessage(result.error.code)
              : "השיחות עדיין נטענות. אפשר לנסות שוב בעוד רגע.",
          );
          return;
        }
        setConversations([...result.data.items]);
        setConversationCursor(result.data.nextCursor);
        const storedId =
          preferredId ?? window.localStorage.getItem(advisorConversationStorageKey(advisor.id));
        const restored = selectRestoredAdvisorConversation(result.data.items, advisor.id, storedId);
        if (!restored) {
          setActiveConversation(null);
          setMessages([]);
          setContextFlags([]);
          setQuotaState("loading");
          setViewState("ready");
          return;
        }
        await applyLoadedConversation(restored);
      } catch {
        if (!mountedRef.current) return;
        setViewState("error");
        setQuotaState("error");
        setOperationError("השיחות אינן זמינות כרגע. אפשר לנסות שוב מאוחר יותר.");
      }
    },
    [advisor.id, applyLoadedConversation],
  );

  useEffect(() => {
    mountedRef.current = true;
    void loadConversationList();
    return () => {
      mountedRef.current = false;
    };
  }, [loadConversationList]);

  useEffect(() => {
    if (!messageViewportRef.current) return;
    if (forceFollowRef.current || nearBottomRef.current) {
      forceFollowRef.current = false;
      window.requestAnimationFrame(() => scrollToLatest(messages.length ? "smooth" : "auto"));
    } else if (messages.length) setShowNewMessageChip(true);
  }, [messages, isSending, scrollToLatest]);

  const createConversation = useCallback(async (): Promise<AdvisorConversationDto | null> => {
    setIsMutating(true);
    setOperationError(null);
    try {
      const result = await createAdvisorConversationServer({ data: { advisorId: advisor.id } });
      if (result.status !== "success") {
        setOperationError(
          result.status === "error"
            ? advisorConversationErrorMessage(result.error.code)
            : "השיחה עדיין נוצרת. אפשר לנסות שוב בעוד רגע.",
        );
        return null;
      }
      const conversation = result.data.conversation;
      setConversations((current) => upsertAdvisorConversation(current, conversation));
      setActiveConversation(conversation);
      setMessages([]);
      setContextFlags([]);
      setMessageCursor(null);
      window.localStorage.setItem(advisorConversationStorageKey(advisor.id), conversation.id);
      await applyLoadedConversation(conversation);
      setIsHistoryOpen(false);
      return conversation;
    } catch {
      setOperationError("לא הצלחנו ליצור שיחה חדשה כרגע.");
      return null;
    } finally {
      setIsMutating(false);
    }
  }, [advisor.id, applyLoadedConversation]);

  const pollPendingTurn = useCallback(async (conversationId: string) => {
    for (let attempt = 0; attempt < ADVISOR_PENDING_MAX_POLLS; attempt += 1) {
      await wait(ADVISOR_PENDING_POLL_INTERVAL_MS);
      if (!mountedRef.current) return false;
      const result = await getAdvisorConversationMessagesServer({
        data: createAdvisorMessagesPayload(conversationId),
      });
      if (result.status !== "success") continue;
      setMessages([...result.data.messages.items]);
      setMessageCursor(result.data.messages.nextCursor);
      setContextFlags(result.data.contextFlags);
      setQuotaState(quotaPresentationToClientState(result.data.quota));
      if (!hasGeneratingAdvisorMessage(result.data.messages.items)) return true;
    }
    setOperationError("התשובה עדיין מתעכבת. אפשר לרענן את השיחה בלי לשלוח שוב.");
    return false;
  }, []);

  const sendMessage = useCallback(
    async (text: string, retryOfMessageId?: string): Promise<boolean> => {
      const clean = text.trim();
      if (!clean || requestInFlightRef.current) return false;
      let conversation = activeConversation;
      if (!conversation) conversation = await createConversation();
      if (!conversation) return false;
      requestInFlightRef.current = true;
      forceFollowRef.current = true;
      setIsSending(true);
      setOperationError(null);
      const clientRequestId = crypto.randomUUID();
      try {
        const result = await sendAdvisorMessageServer({
          data: createAdvisorSendPayload({
            conversationId: conversation.id,
            clientRequestId,
            message: clean,
            retryOfMessageId,
          }),
        });
        if (result.status === "pending") {
          await pollPendingTurn(conversation.id);
          return true;
        }
        if (result.status === "error") {
          if (result.error.code === "DAILY_QUOTA_EXCEEDED") setQuotaState("exhausted");
          setOperationError(advisorConversationErrorMessage(result.error.code));
          if (result.error.code !== "PERSISTENCE_UNAVAILABLE")
            await applyLoadedConversation(conversation);
          return result.error.code !== "PERSISTENCE_UNAVAILABLE";
        }
        const completed = [result.data.userMessage, result.data.assistantMessage].filter(
          (message): message is AdvisorMessageDto => Boolean(message),
        );
        setMessages((current) => mergeAdvisorMessages(current, completed));
        setActiveConversation(result.data.conversation);
        setConversations((current) => upsertAdvisorConversation(current, result.data.conversation));
        setQuotaState(quotaPresentationToClientState(result.data.quota));
        setContextFlags(result.data.contextFlags);
        return true;
      } catch {
        setOperationError("החיבור נקטע. אפשר לרענן את השיחה; לא נשלח ניסיון נוסף אוטומטית.");
        return false;
      } finally {
        requestInFlightRef.current = false;
        setIsSending(false);
      }
    },
    [activeConversation, applyLoadedConversation, createConversation, pollPendingTurn],
  );

  const switchConversation = async (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.advisorId !== advisor.id) {
      setOperationError("השיחה אינה שייכת ליועץ הזה.");
      return;
    }
    setIsHistoryOpen(false);
    setViewState("loading");
    setMessages([]);
    await applyLoadedConversation(conversation);
  };

  const loadMoreConversations = async () => {
    if (!conversationCursor || isMutating) return;
    setIsMutating(true);
    try {
      const result = await listAdvisorConversationsServer({
        data: { advisorId: advisor.id, cursor: conversationCursor, limit: 50 },
      });
      if (result.status === "success") {
        setConversations((current) => [
          ...current,
          ...result.data.items.filter((item) => !current.some((known) => known.id === item.id)),
        ]);
        setConversationCursor(result.data.nextCursor);
      }
    } finally {
      setIsMutating(false);
    }
  };

  const loadOlderMessages = async () => {
    if (!activeConversation || !messageCursor || isMutating) return;
    setIsMutating(true);
    const previousHeight = messageViewportRef.current?.scrollHeight ?? 0;
    try {
      const result = await getAdvisorConversationMessagesServer({
        data: createAdvisorMessagesPayload(activeConversation.id, messageCursor),
      });
      if (result.status === "success") {
        setMessages((current) => mergeAdvisorMessages(current, result.data.messages.items, true));
        setMessageCursor(result.data.messages.nextCursor);
        window.requestAnimationFrame(() => {
          const viewport = messageViewportRef.current;
          if (viewport) viewport.scrollTop += viewport.scrollHeight - previousHeight;
        });
      }
    } finally {
      setIsMutating(false);
    }
  };

  const renameConversation = async (title: string) => {
    if (!renameTarget) return;
    const result = await renameAdvisorConversationServer({
      data: { conversationId: renameTarget.id, title },
    });
    if (result.status !== "success") {
      setOperationError(
        result.status === "error"
          ? advisorConversationErrorMessage(result.error.code)
          : "שינוי השם עדיין בטיפול.",
      );
      return;
    }
    setConversations((current) => upsertAdvisorConversation(current, result.data.conversation));
    if (activeConversation?.id === result.data.conversation.id)
      setActiveConversation(result.data.conversation);
  };

  const deleteConversation = async () => {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    const result = await deleteAdvisorConversationServer({ data: { conversationId: deletedId } });
    if (result.status !== "success") {
      setOperationError(
        result.status === "error"
          ? advisorConversationErrorMessage(result.error.code)
          : "המחיקה עדיין בטיפול.",
      );
      return;
    }
    const remaining = removeAdvisorConversation(conversations, deletedId);
    setConversations(remaining);
    if (activeConversation?.id === deletedId) {
      window.localStorage.removeItem(advisorConversationStorageKey(advisor.id));
      const replacement = selectRestoredAdvisorConversation(remaining, advisor.id, null);
      if (replacement) await applyLoadedConversation(replacement);
      else {
        setActiveConversation(null);
        setMessages([]);
        setContextFlags([]);
        setQuotaState("loading");
      }
    }
    setDeleteTarget(null);
  };

  const hasStarted = messages.some((message) => message.role === "user");
  const isQuotaExhausted = quotaState === "exhausted";
  const canSend =
    viewState === "ready" &&
    !isMutating &&
    (activeConversation === null || quotaState === "available" || quotaState === "unlimited");

  return (
    <div dir="rtl" className="min-w-0 space-y-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <header className="flex min-w-0 items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="חזרה ליועצים">
          <Link to="/coach">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <AdvisorVisual advisor={advisor} variant="avatar" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold">{advisor.name}</h1>
          <p className="truncate text-xs text-muted-foreground">{advisor.field}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0 gap-1.5"
          onClick={() => setIsHistoryOpen(true)}
          aria-label={`פתיחת רשימת השיחות עם ${advisor.name}`}
        >
          <History className="h-4 w-4" aria-hidden /> שיחות
        </Button>
      </header>

      <AdvisorVisual advisor={advisor} variant="hero" />
      <div className="flex gap-2 rounded-2xl border border-border/60 bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p>ההמלצות הן כלליות בלבד ואינן תחליף לייעוץ רפואי או מקצועי.</p>
      </div>

      {activeConversation && quotaState !== "unlimited" && (
        <div
          role="status"
          className={
            quotaState === "available"
              ? "rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-medium"
              : isQuotaExhausted
                ? "rounded-2xl border border-primary/35 bg-primary/10 px-3 py-2.5 shadow-sm"
                : "rounded-2xl border border-border/60 bg-muted/35 px-3 py-2 text-xs font-medium text-muted-foreground"
          }
        >
          {quotaState === "loading" && "בודקים את זמינות השאלה היומית…"}
          {quotaState === "available" && "השאלה היומית שלך זמינה"}
          {quotaState === "exhausted" && (
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                <CalendarClock className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 leading-snug">
                <p className="text-sm font-bold">השאלה היומית נוצלה להיום</p>
                <p className="mt-0.5 text-xs text-muted-foreground">שאלה חדשה תחכה לך מחר</p>
              </div>
            </div>
          )}
          {quotaState === "error" && "לא הצלחנו לבדוק את זמינות השאלה כרגע."}
        </div>
      )}

      <AdvisorContextNotice flags={contextFlags} />
      {operationError && (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs"
        >
          {operationError}
        </div>
      )}

      {viewState === "error" ? (
        <ChatFailureState onRetry={() => void loadConversationList(activeConversation?.id)} />
      ) : (
        <div className="relative min-w-0">
          <section
            ref={messageViewportRef}
            onScroll={(event) => {
              const viewport = event.currentTarget;
              nearBottomRef.current = shouldFollowLatestMessage(
                viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
              );
              if (nearBottomRef.current) setShowNewMessageChip(false);
            }}
            className="max-h-[56dvh] min-h-48 min-w-0 space-y-2 overflow-x-hidden overflow-y-auto overscroll-contain px-0.5 py-1"
            aria-label={`שיחה עם ${advisor.name}`}
            aria-live="polite"
          >
            {messageCursor && (
              <div className="text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadOlderMessages()}
                  disabled={isMutating}
                >
                  הצגת הודעות קודמות
                </Button>
              </div>
            )}
            {viewState === "loading" ? (
              <ConversationSkeleton />
            ) : (
              <>
                {!messages.length && (
                  <ChatMessageBubble
                    message={introMessage(advisor)}
                    advisor={advisor}
                    userAvatarUrl={resolvedUserAvatarUrl}
                    userName={userName}
                  />
                )}
                {messages.map((message) => (
                  <ChatMessageBubble
                    key={message.id}
                    message={message}
                    advisor={advisor}
                    userAvatarUrl={resolvedUserAvatarUrl}
                    userName={userName}
                    onRetry={(messageId, text) => void sendMessage(text, messageId)}
                  />
                ))}
                {isSending && (
                  <div className="flex max-w-[88%] items-center gap-2 rounded-3xl rounded-tr-md border border-border/60 bg-card/70 px-4 py-3 text-xs text-muted-foreground">
                    <LoaderCircle className="h-4 w-4 animate-spin text-primary" aria-hidden />{" "}
                    {advisor.name} מכין תשובה…
                  </div>
                )}
              </>
            )}
          </section>
          {showNewMessageChip && <NewMessageChip onClick={() => scrollToLatest()} />}
        </div>
      )}

      {!hasStarted && viewState === "ready" && (
        <section>
          <h2 className="mb-1.5 text-sm font-bold">אפשר להתחיל מכאן</h2>
          <div className="grid grid-cols-2 gap-1.5">
            {advisor.quickActions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => void sendMessage(action)}
                disabled={isSending || !canSend}
                className="min-h-11 min-w-0 rounded-2xl border border-border/60 bg-card/60 px-3 py-2 text-right text-xs font-medium leading-snug transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
              >
                {action}
              </button>
            ))}
          </div>
        </section>
      )}

      <ChatComposer
        onSend={(message) => sendMessage(message)}
        disabled={!canSend}
        isLoading={isSending}
        isQuotaExhausted={isQuotaExhausted}
        quotaState={activeConversation ? quotaState : "available"}
        placeholder={`כתבו ל${advisor.name}…`}
      />

      <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <SheetContent side="right" className="w-[min(88vw,24rem)] overflow-y-auto" dir="rtl">
          <SheetHeader className="text-right">
            <SheetTitle>השיחות עם {advisor.name}</SheetTitle>
            <SheetDescription>אפשר לחזור לשיחה, לשנות לה שם או להסיר אותה.</SheetDescription>
          </SheetHeader>
          <Button
            type="button"
            className="mt-5 min-h-11 w-full gap-2"
            onClick={() => void createConversation()}
            disabled={isMutating}
          >
            <Plus className="h-4 w-4" aria-hidden /> שיחה חדשה
          </Button>
          <div className="mt-4">
            {viewState === "loading" ? (
              <ConversationSkeleton />
            ) : conversations.length ? (
              <ConversationList
                conversations={conversations}
                onSelect={(id) => void switchConversation(id)}
                onRename={(id) =>
                  setRenameTarget(conversations.find((item) => item.id === id) ?? null)
                }
                onDelete={(id) =>
                  setDeleteTarget(conversations.find((item) => item.id === id) ?? null)
                }
              />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                אין שיחות שמורות עדיין.
              </p>
            )}
          </div>
          {conversationCursor && (
            <Button
              type="button"
              variant="ghost"
              className="mt-3 w-full"
              onClick={() => void loadMoreConversations()}
              disabled={isMutating}
            >
              טעינת שיחות נוספות
            </Button>
          )}
        </SheetContent>
      </Sheet>

      <RenameConversationDialog
        isOpen={Boolean(renameTarget)}
        onOpenChange={(open) => !open && setRenameTarget(null)}
        currentTitle={renameTarget?.title ?? "שיחה ללא שם"}
        onRename={renameConversation}
      />
      <DeleteConversationDialog
        isOpen={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={deleteConversation}
      />
    </div>
  );
}
