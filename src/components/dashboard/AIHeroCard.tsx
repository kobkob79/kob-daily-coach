/**
 * AI Hero Card — "היום הגוף שלך אומר...".
 * Renders the daily AI narrative from the server-side daily brief.
 */
import { Heart, Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { PremiumCard } from "@/components/ui-kit/Section";
import { cn } from "@/lib/utils";
import type { DailyBrief } from "@/lib/daily-brief";

interface Props {
  brief: DailyBrief | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  displayName: string;
}

export function AIHeroCard({ brief, isLoading, isError, errorMessage, onRetry, displayName }: Props) {
  return (
    <PremiumCard className="relative overflow-hidden border-none p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "linear-gradient(135deg, rgba(244,114,182,0.28), rgba(168,85,247,0.22) 45%, rgba(56,189,248,0.22))",
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-fuchsia-600 shadow-lg shadow-rose-500/30">
            <Heart className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Viora · המאמן האישי
            </p>
            <h2 className="text-lg font-bold">
              היום הגוף שלך אומר{displayName ? <span className="text-foreground/80">, {displayName}</span> : "..."}
            </h2>
          </div>
        </div>

        <div className="mt-4 min-h-[88px] rounded-2xl bg-background/50 p-4 backdrop-blur-sm">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className={cn("h-4 w-4 animate-pulse text-primary")} />
              <span>Viora מכין את הניתוח היומי שלך…</span>
            </div>
          )}
          {isError && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm text-warning">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{errorMessage ?? "לא הצלחתי לייצר ניתוח כרגע."}</p>
              </div>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> נסה שוב
                </button>
              )}
            </div>
          )}
          {brief && !isLoading && !isError && (
            <p className="text-[15px] leading-relaxed text-foreground/95">{brief.hero}</p>
          )}
        </div>
      </div>
    </PremiumCard>
  );
}
