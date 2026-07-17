/**
 * /ask — the AI conversation surface.
 *
 * The AskViora sheet routes text questions here (never silently to
 * /capture). We preserve the pending question + originating screen
 * context via URL search params so nothing is discarded.
 *
 * Until a real chat backend is wired in, we show an honest holding
 * state ("המאמן של Viora עדיין מתחבר. השאלה שלך נשמרה.") — we do NOT
 * fabricate an AI response.
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronLeft, Sparkles } from "lucide-react";
import { decodeAIContext, type AIContext } from "@/lib/ai-context";
import { PremiumCard } from "@/components/ui-kit/Section";

type AskSearch = { q?: string; ctx?: string };

export const Route = createFileRoute("/_authenticated/ask")({
  validateSearch: (s: Record<string, unknown>): AskSearch => ({
    q: typeof s.q === "string" ? s.q : undefined,
    ctx: typeof s.ctx === "string" ? s.ctx : undefined,
  }),
  component: AskPage,
});

function AskPage() {
  const { q, ctx } = Route.useSearch();
  const router = useRouter();
  const context: AIContext | null = decodeAIContext(ctx);

  return (
    <div className="space-y-5 pb-4" dir="rtl">
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.history.back()}
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
          aria-label="חזור"
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight">שיחה עם Viora</h1>
          <p className="text-xs text-muted-foreground">המאמן האישי שלך</p>
        </div>
      </div>

      {/* User's question — preserved verbatim */}
      {q && (
        <div className="ms-auto max-w-[85%] rounded-3xl rounded-tr-md border border-primary/25 bg-primary/10 px-4 py-3 text-[14px] leading-relaxed text-foreground">
          {q}
        </div>
      )}

      {/* Honest holding state */}
      <PremiumCard className="relative overflow-hidden">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Viora</p>
            <p className="mt-1 text-[14px] leading-relaxed text-foreground/85">
              המאמן של Viora עדיין מתחבר. השאלה שלך נשמרה.
            </p>
            {context && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                נשמר גם ההקשר של המסך ({context.screen}) לשימוש עתידי.
              </p>
            )}
          </div>
        </div>
      </PremiumCard>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/dashboard"
          className="rounded-full border border-border/60 bg-card/60 px-4 py-2 text-[13px] font-medium text-foreground/80 hover:border-primary/40"
        >
          חזרה למסך הבית
        </Link>
        <Link
          to="/capture"
          className="rounded-full border border-border/60 bg-card/60 px-4 py-2 text-[13px] font-medium text-foreground/80 hover:border-primary/40"
        >
          פתח צילום חכם
        </Link>
      </div>
    </div>
  );
}
