/**
 * Planner workout card (VIORA-PLANNER-001).
 *
 * Presentational only — receives derived planning data and drag handlers.
 */
import { Dumbbell, GripVertical, Layers, Moon, Pencil, Plus, Timer } from "lucide-react";
import {
  STATUS_META,
  formatMinutes,
  formatShortDate,
  type DayStatus,
} from "@/lib/weekly-planner";

export type PlannerDay = {
  weekday: number;
  weekdayLabel: string;
  date: Date;
  status: DayStatus;
  workoutName: string | null;
  workoutType: string | null;
  exerciseCount: number;
  estimatedMinutes: number;
};

export function PlannerDayCard({
  day,
  dragging,
  isDropTarget,
  onEdit,
  onDragStart,
}: {
  day: PlannerDay;
  dragging?: boolean;
  isDropTarget?: boolean;
  onEdit: () => void;
  onDragStart?: (e: React.PointerEvent) => void;
}) {
  const meta = STATUS_META[day.status];
  const assigned = !!day.workoutName && day.status !== "rest";

  const surface =
    day.status === "empty"
      ? "border-dashed border-border bg-card/60"
      : day.status === "rest"
        ? "border-border bg-muted/30"
        : "border-primary/40 bg-primary/[0.07]";

  return (
    <div
      data-day={day.weekday}
      className={`relative flex items-stretch gap-3 rounded-2xl border p-3 text-right transition ${surface} ${
        day.status === "today" ? "ring-2 ring-sky-500/60" : ""
      } ${isDropTarget ? "ring-2 ring-primary scale-[1.01]" : ""} ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-right active:scale-[0.99]"
      >
        <div
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-sm font-bold leading-tight ${
            assigned ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          <span>{day.weekdayLabel}</span>
          <span className="text-[10px] font-medium tabular-nums opacity-80">
            {formatShortDate(day.date)}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.chip}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
            {day.workoutType && (
              <span className="truncate text-[10px] text-muted-foreground">{day.workoutType}</span>
            )}
          </div>

          <p
            className={`mt-1 truncate text-base font-bold ${
              assigned ? "" : "text-muted-foreground"
            }`}
          >
            {day.workoutName ?? "יום פנוי"}
          </p>

          {assigned ? (
            <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {day.exerciseCount} תרגילים
              </span>
              <span className="inline-flex items-center gap-1">
                <Timer className="h-3 w-3" />
                {formatMinutes(day.estimatedMinutes)}
              </span>
            </div>
          ) : (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {day.status === "rest" ? "מנוחה מתוכננת" : "הקש להוספת אימון"}
            </p>
          )}
        </div>
      </button>

      <div className="flex shrink-0 flex-col items-center justify-center gap-2">
        {assigned ? (
          <>
            <span
              onPointerDown={onDragStart}
              className="cursor-grab touch-none rounded-lg p-1.5 text-muted-foreground active:cursor-grabbing"
              aria-label="גרור לשינוי יום"
            >
              <GripVertical className="h-4 w-4" />
            </span>
            <Dumbbell className="h-4 w-4 text-primary" />
          </>
        ) : day.status === "rest" ? (
          <Moon className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Plus className="h-4 w-4 text-primary" />
        )}
        {assigned && <Pencil className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
    </div>
  );
}
