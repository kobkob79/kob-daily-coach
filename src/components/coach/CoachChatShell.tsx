import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle, RotateCcw, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateAdvisorResponseServer } from "@/lib/advisor-chat.functions";
import type { CoachAdvisor } from "@/lib/coach-advisors";
import { AdvisorVisual } from "./AdvisorVisual";

interface ChatMessage {
  id: string;
  role: "advisor" | "user";
  text: string;
}

interface FailedMessage {
  text: string;
}

function createLocalId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function CoachChatShell({ advisor }: { advisor: CoachAdvisor }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: `intro_${advisor.id}`, role: "advisor", text: advisor.intro },
  ]);
  const [conversationId] = useState(() => createLocalId(`conversation_${advisor.id}`));
  const [isLoading, setIsLoading] = useState(false);
  const [failedMessage, setFailedMessage] = useState<FailedMessage | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const hasInteractedRef = useRef(false);
  const requestInFlightRef = useRef(false);

  const hasStarted = messages.some((message) => message.role === "user");

  useEffect(() => {
    if (!hasInteractedRef.current) return;
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isLoading, failedMessage]);

  const sendMessage = async (text: string, appendUserMessage = true) => {
    const clean = text.trim();
    if (!clean || requestInFlightRef.current) return;

    hasInteractedRef.current = true;
    requestInFlightRef.current = true;
    setFailedMessage(null);
    setIsLoading(true);

    if (appendUserMessage) {
      setMessages((current) => [
        ...current,
        { id: createLocalId("user"), role: "user", text: clean },
      ]);
    }

    try {
      const response = await generateAdvisorResponseServer({
        data: {
          advisor_id: advisor.id,
          message: clean,
          conversation_id: conversationId,
        },
      });
      const responseText = response.text?.trim();

      if (!responseText) {
        throw new Error("Empty advisor response");
      }

      setMessages((current) => [
        ...current,
        { id: response.response_id, role: "advisor", text: responseText },
      ]);
      setInput((current) => (current.trim() === clean ? "" : current));
    } catch {
      setFailedMessage({ text: clean });
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

      {!hasStarted && (
        <section>
          <h2 className="mb-1.5 text-sm font-bold">אפשר להתחיל מכאן</h2>
          <div className="grid grid-cols-2 gap-1.5">
            {advisor.quickActions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => void sendMessage(action)}
                disabled={isLoading}
                className="min-h-11 rounded-2xl border border-border/60 bg-card/60 px-3 py-2 text-right text-xs font-medium leading-snug transition active:scale-[0.98] active:border-primary/40 disabled:pointer-events-none disabled:opacity-50"
              >
                {action}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2" aria-label={`שיחה עם ${advisor.name}`} aria-live="polite">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === "advisor"
                ? "max-w-[88%] rounded-3xl rounded-tr-md border border-border/60 bg-card/70 px-4 py-3 text-sm leading-relaxed"
                : "mr-auto max-w-[85%] rounded-3xl rounded-tl-md border border-primary/25 bg-primary/10 px-4 py-3 text-sm leading-relaxed"
            }
          >
            {message.text}
          </div>
        ))}

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
              onClick={() => void sendMessage(failedMessage.text, false)}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              ניסיון נוסף
            </Button>
          </div>
        )}

        <div ref={conversationEndRef} />
      </section>

      <form onSubmit={submit} className="sticky bottom-0 flex gap-2 rounded-2xl border border-border/60 bg-background/90 p-2 backdrop-blur-xl">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={`כתבו ל${advisor.name}…`}
          className="h-12"
          autoComplete="off"
          aria-label={`הודעה ל${advisor.name}`}
        />
        <Button
          type="submit"
          size="icon"
          className="h-12 w-12 shrink-0"
          disabled={isLoading || !input.trim()}
        >
          <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
          <span className="sr-only">שליחה</span>
        </Button>
      </form>
    </div>
  );
}
