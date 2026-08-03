/**
 * RestTimerWidget — the floating rest timer for an active workout.
 *
 * Design rules:
 * - Small, floating, never covers the set list (collapsed by default height).
 * - Expandable / collapsible; the collapse choice persists per session.
 * - Turns RED the moment rest hits zero (overtime), with vibration + optional
 *   sound handled by `useRestTimer`.
 * - The primary action is "לסט הבא" (not a "+"): it closes rest and hands the
 *   athlete back to the active set.
 */
import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Minus, Plus, SkipForward, Volume2, VolumeX } from "lucide-react";

import { formatClock } from "@/hooks/useRestTimer";
import { cn } from "@/lib/utils";

const COLLAPSE_KEY = "viora:rest:collapsed";

/** Collapsed by default: the set list must stay readable while resting. */
function readCollapsed(): boolean {
  if (typeof window === "undefined") return true;
  return window.sessionStorage.getItem(COLLAPSE_KEY) !== "0";
}


export interface RestTimerWidgetProps {
  phase: "idle" | "running" | "overtime";
  remainingSec: number;
  overtimeSec: number;
  plannedSec: number;
  nextSetNumber: number | null;
  totalSets: number;
  nextWeight: number | null;
  nextReps: number | null;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onAddSeconds: (delta: number) => void;
  onSkip: () => void;
  onNextSet: () => void;
}

export function RestTimerWidget({
  phase,
  remainingSec,
  overtimeSec,
  plannedSec,
  nextSetNumber,
  totalSets,
  nextWeight,
  nextReps,
  soundEnabled,
  onToggleSound,
  onAddSeconds,
  onSkip,
  onNextSet,
}: RestTimerWidgetProps) {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const over = phase === "overtime";

  useEffect(() => {
    try {
      window.sessionStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Auto-expand once when rest ends so the red state is unmissable.
  useEffect(() => {
    if (over) setCollapsed(false);
  }, [over]);

  const progress = plannedSec > 0 ? Math.min(1, (plannedSec - remainingSec) / plannedSec) : 1;
  const clock = over ? `+${formatClock(overtimeSec)}` : formatClock(remainingSec);

  const shell = cn(
    "overflow-hidden rounded-3xl border backdrop-blur-xl transition-all duration-300",
    over
      ? "border-destructive/70 bg-destructive/[0.10] shadow-[0_8px_36px_-14px_var(--destructive)]"
      : "border-accent/40 bg-card/85 shadow-glow-accent",
  );

  return (
    <div className={shell}>
      {/* Header row — always visible, tappable to collapse/expand */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "הרחב טיימר מנוחה" : "כווץ טיימר מנוחה"}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-right"
      >
        <span
          className={cn(
            "font-mono text-2xl font-extrabold tabular-nums transition-colors",
            over ? "text-destructive" : "text-foreground",
          )}
        >
          {clock}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-[11px] font-bold uppercase tracking-wider",
              over ? "text-destructive" : "text-accent",
            )}
          >
            {over ? "המנוחה הסתיימה" : "מנוחה"}
          </span>
          {nextSetNumber != null && (
            <span className="block truncate text-[11px] text-muted-foreground">
              הבא: סט {nextSetNumber} מתוך {totalSets}
              {nextWeight != null || nextReps != null
                ? ` · ${nextWeight ?? "—"} ק״ג × ${nextReps ?? "—"}`
                : ""}
            </span>
          )}
        </span>
        {collapsed ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Thin progress line, red in overtime */}
      <div className="h-0.5 w-full bg-border/40">
        <div
          className={cn("h-full transition-[width] duration-300", over ? "bg-destructive" : "bg-accent")}
          style={{ width: `${Math.round((over ? 1 : progress) * 100)}%` }}
        />
      </div>

      {!collapsed && (
        <div className="space-y-2 px-3 pb-3 pt-2">
          <div className="flex items-center gap-2">
            <IconAction label="הפחת 15 שניות" onClick={() => onAddSeconds(-15)}>
              <Minus className="h-4 w-4" />
              <span className="text-xs font-bold">15</span>
            </IconAction>
            <IconAction label="הוסף 15 שניות" onClick={() => onAddSeconds(15)}>
              <Plus className="h-4 w-4" />
              <span className="text-xs font-bold">15</span>
            </IconAction>
            <IconAction label="דלג על המנוחה" onClick={onSkip}>
              <SkipForward className="h-4 w-4" />
            </IconAction>
            <IconAction
              label={soundEnabled ? "כבה צליל סיום מנוחה" : "הפעל צליל סיום מנוחה"}
              onClick={onToggleSound}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </IconAction>
          </div>
          <button
            onClick={onNextSet}
            className={cn(
              "h-12 w-full rounded-2xl text-base font-extrabold transition active:scale-[0.98]",
              over
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground",
            )}
          >
            לסט הבא
          </button>
        </div>
      )}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-10 flex-1 items-center justify-center gap-1 rounded-2xl bg-muted/60 text-foreground transition active:scale-95"
    >
      {children}
    </button>
  );
}
