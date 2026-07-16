/**
 * AskVioraSheet — the bottom sheet triggered by the center navigation
 * button. Compact (~45% viewport) surface with voice, text, camera and
 * quick suggestion chips. The AI is context-aware: it receives the
 * current pathname so downstream flows can adapt.
 */
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Camera, Mic, Send, Sparkles } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const SCREEN_LABELS: Record<string, string> = {
  "/dashboard": "מסך הבית",
  "/workouts": "אימונים",
  "/meals": "תזונה",
  "/hydration": "שתייה",
  "/health": "בריאות",
  "/shift": "משמרות",
  "/progress": "מגמות",
  "/journal": "יומן",
  "/profile": "פרופיל",
  "/capture": "צילום חכם",
};

const SUGGESTIONS = [
  "מה כדאי לאכול עכשיו?",
  "איך היה האימון שלי?",
  "למה אני עייף?",
  "כמה מים חסרים לי?",
];

export function AskVioraSheet({
  open,
  onOpenChange,
  pathname,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pathname: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const screenLabel = SCREEN_LABELS[pathname] ?? "האפליקציה";

  const send = (q?: string) => {
    const query = (q ?? text).trim();
    if (!query) return;
    onOpenChange(false);
    setText("");
    router.navigate({ to: "/capture" });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "border-0 bg-transparent p-0 shadow-none",
          "data-[state=open]:duration-300",
        )}
      >
        <div className="mx-auto w-full max-w-2xl px-3 pb-[env(safe-area-inset-bottom)]">
          <div className="relative overflow-hidden rounded-t-[32px] border border-white/10 bg-card/90 p-5 backdrop-blur-2xl shadow-[0_-24px_80px_-20px_oklch(0.93_0.24_125/0.35)]">
            {/* Ambient glow */}
            <div
              className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-primary/25 blur-3xl animate-soft-pulse"
              aria-hidden
            />

            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />

            <div className="relative mb-4 flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/15 text-primary">
                <Sparkles className="h-4 w-4" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-[15px] font-bold leading-tight">שאל את Viora</p>
                <p className="text-[11px] text-muted-foreground">
                  ההקשר: {screenLabel}
                </p>
              </div>
            </div>

            {/* Suggestion chips */}
            <div className="relative -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[12.5px] font-medium text-foreground/85 transition hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:scale-95"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Composer */}
            <div className="relative flex items-center gap-2 rounded-3xl border border-white/10 bg-background/60 p-2">
              <button
                aria-label="מצלמה"
                onClick={() => {
                  onOpenChange(false);
                  router.navigate({ to: "/capture" });
                }}
                className="grid h-10 w-10 place-items-center rounded-2xl bg-white/5 text-foreground/80 transition hover:bg-primary/15 hover:text-primary active:scale-95"
              >
                <Camera className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>

              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="כתוב הודעה ל־Viora…"
                className="min-w-0 flex-1 bg-transparent px-2 text-[14px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
              />

              <button
                aria-label="קול"
                className="grid h-10 w-10 place-items-center rounded-2xl bg-white/5 text-foreground/80 transition hover:bg-primary/15 hover:text-primary active:scale-95"
              >
                <Mic className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>

              <button
                aria-label="שלח"
                onClick={() => send()}
                className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_-6px_oklch(0.93_0.24_125/0.55)] transition active:scale-95"
              >
                <Send className="h-[18px] w-[18px] rtl:-scale-x-100" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
