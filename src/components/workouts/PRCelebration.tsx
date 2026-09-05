/**
 * PRCelebration — a small, non-blocking personal-record celebration.
 *
 * Renders as a floating banner above the workout content, auto-dismisses and
 * never traps focus or interrupts the set flow. Respects reduced-motion.
 */
import { useEffect } from "react";
import { Trophy, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type PRKind = "weight" | "reps" | "volume" | "e1rm" | "duration";

export const PR_KIND_LABEL: Record<PRKind, string> = {
  weight: "משקל",
  reps: "חזרות",
  volume: "נפח",
  e1rm: "1RM משוער",
  duration: "משך",
};

export interface PRCelebrationData {
  /** Which records were beaten in this set. */
  kinds: PRKind[];
  /** Short Hebrew detail line, e.g. "62.5 ק״ג × 10". */
  detail: string;
  /** Changes whenever a new celebration should re-trigger. */
  id: string;
}

export function PRCelebration({
  data,
  onDismiss,
  autoDismissMs = 4200,
}: {
  data: PRCelebrationData | null;
  onDismiss: () => void;
  autoDismissMs?: number;
}) {
  useEffect(() => {
    if (!data) return;
    const id = window.setTimeout(onDismiss, autoDismissMs);
    return () => window.clearTimeout(id);
  }, [data, onDismiss, autoDismissMs]);

  if (!data) return null;

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-40 mx-auto max-w-md px-4"
      style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
    >
      <div
        key={data.id}
        className={cn(
          "pointer-events-auto animate-slide-up overflow-hidden rounded-3xl border border-primary/60",
          "bg-card/90 px-4 py-3 shadow-glow backdrop-blur-xl",
        )}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary animate-soft-pulse">
            <Trophy className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-primary">🏆 שיא אישי חדש</p>
            <p className="truncate text-xs text-muted-foreground">
              {data.kinds.map((k) => PR_KIND_LABEL[k]).join(" · ")} — {data.detail}
            </p>
          </div>
          <button
            onClick={onDismiss}
            aria-label="סגור הודעת שיא"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
