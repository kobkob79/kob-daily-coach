/**
 * FloatingRestTimer — a compact floating rest assistant.
 *
 * Design rules (VIORA-WORKOUT-UX-006):
 * - 60px circular pill with an animated progress ring; never occupies layout
 *   space, so the set table stays fully visible while scrolling.
 * - Draggable vertically along the screen edge (position kept per session).
 * - Tap opens a compact bottom sheet with pause/resume, ±15s, skip and mute.
 * - At zero the ring turns red, the badge pulses and a small top banner
 *   announces "המנוחה הסתיימה" (feedback/reminders live in `useRestTimer`).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Pause, Play, Plus, SkipForward, Volume2, VolumeX } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatClock } from "@/hooks/useRestTimer";
import { cn } from "@/lib/utils";

const POS_KEY = "viora:rest:floatY";
const SIZE = 60;
const STROKE = 5;

export interface FloatingRestTimerProps {
  phase: "idle" | "running" | "overtime";
  paused: boolean;
  remainingSec: number;
  overtimeSec: number;
  plannedSec: number;
  nextSetNumber: number | null;
  totalSets: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onTogglePause: () => void;
  onAddSeconds: (delta: number) => void;
  onSkip: () => void;
}

export function FloatingRestTimer({
  phase,
  paused,
  remainingSec,
  overtimeSec,
  plannedSec,
  nextSetNumber,
  totalSets,
  soundEnabled,
  onToggleSound,
  onTogglePause,
  onAddSeconds,
  onSkip,
}: FloatingRestTimerProps) {
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startTop: number; moved: boolean } | null>(null);
  const over = phase === "overtime";

  // Restore the last drag position after mount (SSR-safe).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(POS_KEY);
      const parsed = raw ? Number(raw) : NaN;
      setTop(Number.isFinite(parsed) ? parsed : Math.round(window.innerHeight * 0.45));
    } catch {
      setTop(240);
    }
  }, []);

  const clampTop = useCallback((y: number) => {
    // Keep clear of the bottom floating stack (workout clock / finish buttons).
    const max = (typeof window !== "undefined" ? window.innerHeight : 800) - SIZE - 170;
    return Math.max(72, Math.min(max, y));
  }, []);


  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startY: e.clientY, startTop: top ?? 240, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const delta = e.clientY - d.startY;
    if (Math.abs(delta) > 4) d.moved = true;
    if (d.moved) setTop(clampTop(d.startTop + delta));
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      try {
        window.sessionStorage.setItem(POS_KEY, String(top ?? 240));
      } catch {
        /* ignore */
      }
    } else {
      setOpen(true);
    }
  };

  const progress = plannedSec > 0 ? Math.min(1, (plannedSec - remainingSec) / plannedSec) : 1;
  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (over ? 1 : progress);
  const clock = over ? `+${formatClock(overtimeSec)}` : formatClock(remainingSec);

  return (
    <>
      {/* Top banner — small, non-blocking, only while rest is over */}
      {over && (
        <div
          role="status"
          className="fixed inset-x-0 z-50 mx-auto flex max-w-md justify-center px-4 animate-fade-in"
          style={{ top: "calc(env(safe-area-inset-top) + 8px)" }}
        >
          <span className="rounded-full border border-destructive/60 bg-destructive/15 px-3 py-1 text-[11px] font-extrabold text-destructive backdrop-blur-xl">
            המנוחה הסתיימה
          </span>
        </div>
      )}

      {/* Floating circular timer */}
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="טיימר מנוחה — פתח אפשרויות"
        className={cn(
          "fixed z-40 grid place-items-center rounded-full border backdrop-blur-xl transition touch-none active:scale-95",
          over
            ? "border-destructive/70 bg-destructive/15 shadow-[0_8px_30px_-10px_var(--destructive)] animate-pulse"
            : "border-accent/50 bg-card/90 shadow-glow-accent",
        )}
        style={{
          width: SIZE,
          height: SIZE,
          top: top ?? 240,
          insetInlineStart: 12,
        }}
      >
        <svg width={SIZE} height={SIZE} className="absolute inset-0 -rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={STROKE}
            opacity={0.5}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={r}
            fill="none"
            stroke={over ? "var(--color-destructive)" : "var(--color-accent)"}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            className="transition-[stroke-dasharray] duration-300 ease-out"
          />
        </svg>
        <span
          className={cn(
            "relative font-mono text-[13px] font-extrabold tabular-nums leading-none",
            over ? "text-destructive" : "text-foreground",
          )}
        >
          {paused ? "⏸" : clock}
        </span>
      </button>

      {/* Compact actions sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" dir="rtl" className="rounded-t-3xl border-border/60 pb-6">
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center gap-2 text-base">
              <span className={cn("font-mono tabular-nums", over && "text-destructive")}>
                {clock}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {over ? "המנוחה הסתיימה" : "מנוחה"}
                {nextSetNumber != null ? ` · הבא: סט ${nextSetNumber}/${totalSets}` : ""}
              </span>
            </SheetTitle>
          </SheetHeader>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Action label={paused ? "המשך מנוחה" : "השהה מנוחה"} onClick={onTogglePause}>
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {paused ? "המשך" : "השהה"}
            </Action>
            <Action
              label={soundEnabled ? "כבה צליל" : "הפעל צליל"}
              onClick={onToggleSound}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              {soundEnabled ? "צליל פעיל" : "מושתק"}
            </Action>
            <Action label="הוסף 15 שניות" onClick={() => onAddSeconds(15)}>
              <Plus className="h-4 w-4" /> 15 שניות
            </Action>
            <Action label="הפחת 15 שניות" onClick={() => onAddSeconds(-15)}>
              <Minus className="h-4 w-4" /> 15 שניות
            </Action>
          </div>

          <button
            type="button"
            onClick={() => {
              onSkip();
              setOpen(false);
            }}
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-extrabold text-primary-foreground transition active:scale-[0.98]"
          >
            <SkipForward className="h-5 w-5" />
            דלג על המנוחה
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Action({
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
      className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-muted/60 text-sm font-bold text-foreground transition active:scale-95"
    >
      {children}
    </button>
  );
}
