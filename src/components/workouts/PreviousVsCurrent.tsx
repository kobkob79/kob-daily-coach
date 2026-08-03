/**
 * PreviousVsCurrent — the "last time vs now" strip shown on a set.
 *
 * `previous` comes from the most recent completed session for the same
 * exercise + set number. With no history the athlete sees "ניסיון ראשון"
 * instead of an empty slot.
 */
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PreviousPerformance {
  weightKg: number | null;
  reps: number | null;
}

export function formatPerformance(p: PreviousPerformance | null | undefined): string | null {
  if (!p) return null;
  const w = p.weightKg;
  const r = p.reps;
  if (w == null && r == null) return null;
  if (w == null) return `${r} חזרות`;
  if (r == null) return `${w} ק״ג`;
  return `${w} ק״ג × ${r}`;
}

export function PreviousVsCurrent({
  previous,
  current,
  className,
}: {
  previous: PreviousPerformance | null;
  current: PreviousPerformance | null;
  className?: string;
}) {
  const prevText = formatPerformance(previous);
  const curText = formatPerformance(current);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-border/50 bg-muted/25 px-2.5 py-1.5",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">קודם</p>
        <p className="truncate text-xs font-bold tabular-nums">
          {prevText ?? <span className="text-muted-foreground">ניסיון ראשון</span>}
        </p>
      </div>
      <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      <div className="min-w-0 flex-1 text-left">
        <p className="text-[9px] uppercase tracking-wider text-accent">נוכחי</p>
        <p className="truncate text-xs font-bold tabular-nums text-foreground">
          {curText ?? <span className="text-muted-foreground">—</span>}
        </p>
      </div>

    </div>
  );
}
