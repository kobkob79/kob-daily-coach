import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Send, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CoachAdvisor } from "@/lib/coach-advisors";
import { AdvisorVisual } from "./AdvisorVisual";

interface MockMessage {
  id: number;
  role: "advisor" | "user";
  text: string;
}

export function CoachChatShell({ advisor }: { advisor: CoachAdvisor }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MockMessage[]>([
    { id: 1, role: "advisor", text: advisor.intro },
  ]);

  const addLocalMessage = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setMessages((current) => [...current, { id: Date.now(), role: "user", text: clean }]);
    setInput("");
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    addLocalMessage(input);
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

      <div className="relative">
        <AdvisorVisual advisor={advisor} variant="hero" />
        <div className="absolute inset-x-4 top-3 z-20">
          <p className="text-sm font-bold">שיחה עם {advisor.name}</p>
        </div>
      </div>

      <div className="flex gap-2 rounded-2xl border border-border/60 bg-muted/25 p-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p>ההמלצות הן כלליות בלבד ואינן תחליף לייעוץ רפואי או מקצועי.</p>
      </div>

      <section>
        <h2 className="mb-1.5 text-sm font-bold">אפשר להתחיל מכאן</h2>
        <div className="grid grid-cols-2 gap-1.5">
          {advisor.quickActions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => setInput(action)}
              className="min-h-11 rounded-2xl border border-border/60 bg-card/60 px-3 py-2 text-right text-xs font-medium leading-snug transition active:scale-[0.98] active:border-primary/40"
            >
              {action}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2" aria-label="הודעות לדוגמה">
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
        {import.meta.env.DEV && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            V1 מציג הודעות מקומיות בלבד — עדיין אין חיבור ל־AI.
          </div>
        )}
      </section>

      <form onSubmit={submit} className="sticky bottom-0 flex gap-2 rounded-2xl border border-border/60 bg-background/90 p-2 backdrop-blur-xl">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={`כתבו ל${advisor.name}…`}
          className="h-12"
          autoComplete="off"
        />
        <Button type="submit" size="icon" className="h-12 w-12 shrink-0" disabled={!input.trim()}>
          <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
          <span className="sr-only">שליחה מקומית</span>
        </Button>
      </form>
    </div>
  );
}
