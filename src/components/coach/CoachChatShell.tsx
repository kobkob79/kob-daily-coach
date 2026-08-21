import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  LoaderCircle,
  RotateCcw,
  Send,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  generateAdvisorResponseServer,
  getAdvisorDailyQuotaServer,
} from "@/lib/advisor-chat.functions";
import type { CoachAdvisor } from "@/lib/coach-advisors";
import { fetchProfile, PROFILE_BUCKET } from "@/lib/profile";
import { AdvisorMessageContent } from "./AdvisorMessageContent";
import { AdvisorVisual } from "./AdvisorVisual";

interface ChatMessage {
  id: string;
  role: "advisor" | "user";
  text: string;
}

interface FailedMessage {
  text: string;
  userMessageId: string;
}

type QuotaState = "loading" | "available" | "exhausted" | "error";

const QUOTA_EXHAUSTED_CODES = new Set([
  "ADVISOR_DAILY_QUOTA_EXCEEDED",
  "ADVISOR_DAILY_QUOTA_EXHAUSTED",
]);

function createLocalId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

interface CoachChatShellProps {
  advisor: CoachAdvisor;
  userAvatarUrl?: string;
}

async function createProfileAvatarUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(PROFILE_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export function CoachChatShell({ advisor, userAvatarUrl }: CoachChatShellProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: `intro_${advisor.id}`, role: "advisor", text: advisor.intro },
  ]);
  const [conversationId] = useState(() => createLocalId(`conversation_${advisor.id}`));
  const [isLoading, setIsLoading] = useState(false);
  const [failedMessage, setFailedMessage] = useState<FailedMessage | null>(null);
  const [quotaState, setQuotaState] = useState<QuotaState>("loading");
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const hasInteractedRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const profileAvatarPath = profileQuery.data?.avatar_url ?? null;
  const profileAvatarQuery = useQuery({
    queryKey: ["profile-avatar", profileAvatarPath],
    queryFn: () => createProfileAvatarUrl(profileAvatarPath!),
    enabled: !userAvatarUrl && Boolean(profileAvatarPath),
    staleTime: 50 * 60 * 1000,
  });

  const hasStarted = messages.some((message) => message.role === "user");
  const isQuotaExhausted = quotaState === "exhausted";
  const canSend = quotaState === "available";
  const resolvedUserAvatarUrl = userAvatarUrl ?? profileAvatarQuery.data;
  const userName = profileQuery.data?.display_name ?? profileQuery.data?.full_name;
  const userInitial = userName?.trim().charAt(0);

  const loadQuota = useCallback(async () => {
    setQuotaState("loading");
    try {
      const result = await getAdvisorDailyQuotaServer();
      if (!result.ok) {
        setQuotaState("error");
        return;
      }
      setQuotaState(result.quota.allowed ? "available" : "exhausted");
    } catch {
      setQuotaState("error");
    }
  }, []);

  useEffect(() => {
    void loadQuota();
  }, [loadQuota]);

  useEffect(() => {
    if (!hasInteractedRef.current) return;
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isLoading, failedMessage]);

  const sendMessage = async (
    text: string,
    appendUserMessage = true,
    existingUserMessageId?: string,
  ) => {
    const clean = text.trim();
    if (!clean || requestInFlightRef.current || !canSend) return;

    hasInteractedRef.current = true;
    requestInFlightRef.current = true;
    setFailedMessage(null);
    setIsLoading(true);

    const userMessageId = existingUserMessageId ?? createLocalId("user");

    if (appendUserMessage) {
      setMessages((current) => [...current, { id: userMessageId, role: "user", text: clean }]);
    }

    try {
      const result = await generateAdvisorResponseServer({
        data: {
          advisor_id: advisor.id,
          message: clean,
          conversation_id: conversationId,
        },
      });
      if (!result.ok) {
        if (QUOTA_EXHAUSTED_CODES.has(result.error_code)) {
          setMessages((current) => current.filter((message) => message.id !== userMessageId));
          setFailedMessage(null);
          setQuotaState("exhausted");
          return;
        }

        setFailedMessage({ text: clean, userMessageId });
        return;
      }

      const response = result.response;
      const responseText = response.text?.trim();

      if (!responseText) {
        throw new Error("Empty advisor response");
      }

      setMessages((current) => [
        ...current,
        { id: response.response_id, role: "advisor", text: responseText },
      ]);
      if (response.quota?.remaining === 0 || response.quota?.allowed === false) {
        setQuotaState("exhausted");
      }
      setInput((current) => (current.trim() === clean ? "" : current));
    } catch {
      setFailedMessage({ text: clean, userMessageId });
    } finally {
      requestInFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage(input);
  };

  return (
    <div dir="rtl" className="space-y-3 pb-4">
      <header className="flex items-center gap-3">
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
      </header>

      <div>
        <AdvisorVisual advisor={advisor} variant="hero" />
      </div>

      <div className="flex gap-2 rounded-2xl border border-border/60 bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p>ההמלצות הן כלליות בלבד ואינן תחליף לייעוץ רפואי או מקצועי.</p>
      </div>

      <div
        role="status"
        className={
          canSend
            ? "rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-medium text-foreground"
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
              <p className="text-sm font-bold text-foreground">השאלה היומית נוצלה להיום</p>
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                שאלה חדשה תחכה לך מחר
              </p>
            </div>
          </div>
        )}
        {quotaState === "error" && (
          <div className="flex items-center justify-between gap-2">
            <span>לא הצלחנו לבדוק את זמינות השאלה כרגע.</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 shrink-0 px-2 text-xs"
              onClick={() => void loadQuota()}
            >
              ניסיון נוסף
            </Button>
          </div>
        )}
      </div>

      {!hasStarted && (
        <section>
          <h2 className="mb-1.5 text-sm font-bold">אפשר להתחיל מכאן</h2>
          <div className="grid grid-cols-2 gap-1.5">
            {advisor.quickActions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => void sendMessage(action)}
                disabled={isLoading || !canSend}
                className="min-h-11 rounded-2xl border border-border/60 bg-card/60 px-3 py-2 text-right text-xs font-medium leading-snug transition active:scale-[0.98] active:border-primary/40 disabled:pointer-events-none disabled:opacity-50"
              >
                {action}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2" aria-label={`שיחה עם ${advisor.name}`} aria-live="polite">
        {messages.map((message) => {
          const isAdvisor = message.role === "advisor";
          return (
            <div
              key={message.id}
              dir={isAdvisor ? "rtl" : "ltr"}
              className={
                isAdvisor
                  ? "flex w-full max-w-[96%] items-end gap-2 overflow-visible"
                  : "mr-auto flex w-full max-w-[94%] items-end gap-2 overflow-visible"
              }
            >
              <Avatar className="z-10 h-9 w-9 shrink-0 self-end border border-primary/20 bg-card shadow-sm ring-2 ring-background">
                {isAdvisor ? (
                  <>
                    <AvatarImage
                      src={advisor.media.cover}
                      alt={advisor.name}
                      className="object-cover"
                      style={{ objectPosition: advisor.media.coverPosition }}
                    />
                    <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                      {advisor.initials}
                    </AvatarFallback>
                  </>
                ) : (
                  <>
                    {resolvedUserAvatarUrl && (
                      <AvatarImage
                        src={resolvedUserAvatarUrl}
                        alt="תמונת הפרופיל שלך"
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-muted text-xs font-bold text-muted-foreground">
                      {userInitial || <UserRound className="h-4 w-4" aria-hidden />}
                    </AvatarFallback>
                  </>
                )}
              </Avatar>

              <div
                className={
                  isAdvisor
                    ? "min-w-0 flex-1 rounded-3xl rounded-tr-md border border-border/60 bg-card/70 px-4 py-3"
                    : "min-w-0 flex-1 whitespace-pre-wrap break-words rounded-3xl rounded-tl-md border border-primary/25 bg-primary/10 px-4 py-3 text-right text-sm leading-6"
                }
                dir="rtl"
              >
                {isAdvisor ? <AdvisorMessageContent text={message.text} /> : message.text}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex max-w-[88%] items-center gap-2 rounded-3xl rounded-tr-md border border-border/60 bg-card/70 px-4 py-3 text-xs text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin text-primary" aria-hidden />
            {advisor.name} מכין תשובה…
          </div>
        )}

        {failedMessage && !isLoading && (
          <div className="max-w-[88%] rounded-2xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-xs">
            <p>לא הצלחנו לקבל תשובה כרגע. אפשר לנסות שוב.</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1.5 min-h-11 px-2 text-xs"
              onClick={() =>
                void sendMessage(failedMessage.text, false, failedMessage.userMessageId)
              }
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              ניסיון נוסף
            </Button>
          </div>
        )}

        <div ref={conversationEndRef} />
      </section>

      <form
        onSubmit={submit}
        className="sticky bottom-0 flex gap-2 rounded-2xl border border-border/60 bg-background/90 p-2 backdrop-blur-xl"
      >
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            quotaState === "loading"
              ? "בודקים זמינות…"
              : isQuotaExhausted
                ? "השאלה היומית נוצלה להיום"
                : quotaState === "error"
                  ? "לא ניתן לשלוח עד לבדיקת הזמינות"
                  : `כתבו ל${advisor.name}…`
          }
          className="h-12"
          autoComplete="off"
          aria-label={`הודעה ל${advisor.name}`}
          disabled={isLoading || !canSend}
        />
        <Button
          type="submit"
          size="icon"
          className="h-12 w-12 shrink-0"
          disabled={isLoading || !canSend || !input.trim()}
        >
          <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
          <span className="sr-only">שליחה</span>
        </Button>
      </form>
    </div>
  );
}
