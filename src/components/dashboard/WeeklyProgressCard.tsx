/**
 * Weekly Progress — completed workouts vs. weekly goal + streak.
 * Rendered inside the shared Home widget framework.
 */
import { Link } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import type { WeeklyProgress } from "@/lib/command-center";
import { HomeWidget } from "@/components/home/HomeWidget";

export function WeeklyProgressCard({ progress }: { progress: WeeklyProgress }) {
  const dots = Array.from({ length: Math.max(progress.goal, progress.completed, 1) });
  return (
    <HomeWidget
      title="ההתקדמות השבועית"
      action={
        <Link to="/workouts/program" className="text-primary">
          מתכנן שבועי
        </Link>
      }
    >
      <div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              אימונים שהושלמו
            </p>
            <p className="mt-1 text-[28px] font-bold leading-none tracking-tight tabular-nums">
              {progress.completed}
              <span className="ms-1 text-[15px] font-semibold text-muted-foreground">
                / {progress.goal || "—"}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1.5">
            <Flame className="h-4 w-4 text-orange-300" strokeWidth={1.8} />
            <span className="text-[12px] font-bold tabular-nums text-orange-200">
              {progress.streakDays} ימי רצף
            </span>
          </div>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/6">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${Math.max(2, progress.pct)}%` }}
          />
        </div>

        <div className="mt-4 flex items-center gap-1.5">
          {dots.map((_, i) => (
            <span
              key={i}
              className={
                i < progress.completed
                  ? "h-2 flex-1 rounded-full bg-primary"
                  : "h-2 flex-1 rounded-full bg-white/8"
              }
            />
          ))}
        </div>
      </div>
    </HomeWidget>
  );
}
