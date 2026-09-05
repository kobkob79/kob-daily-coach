/**
 * WorkoutHistoryList — the completed-sessions list, shared between the
 * standalone `/workouts/history` page and the unified History hub's
 * "כושר" tab.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { listSessions, type SessionRow } from "@/lib/workout-session";

export function WorkoutHistoryList() {
  const q = useQuery({ queryKey: ["sessions_history"], queryFn: () => listSessions(100) });
  // History shows performed workouts only — planning and active sessions
  // live in the Workout Hub / Weekly Planner.
  const completed = (q.data ?? []).filter((s) => s.status === "completed");

  return (
    <div className="space-y-2">
      {completed.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">אין אימונים שהושלמו עדיין.</p>
      )}
      {completed.map((s) => (
        <HistoryCard key={s.id} s={s} />
      ))}
    </div>
  );
}

function HistoryCard({ s }: { s: SessionRow }) {
  const date = new Date(s.started_at);
  const dateStr = date.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const durMin = s.duration_seconds ? Math.round(s.duration_seconds / 60) : null;

  return (
    <Link to="/workouts/history/$sessionId" params={{ sessionId: s.id }} className="block">
      <div className="surface-card flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-semibold">{s.name ?? "אימון"}</p>
          <p className="text-xs text-muted-foreground">
            {dateStr} · {timeStr}
            {durMin ? ` · ${durMin}׳` : ""}
            {s.total_volume_kg ? ` · ${s.total_volume_kg} ק״ג` : ""}
          </p>
        </div>
        {s.status === "completed" ? (
          <span className="rounded-full bg-success/20 px-2 py-0.5 text-[10px] text-success">
            הושלם
          </span>
        ) : s.status === "discarded" ? (
          <span className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
            נזרק
          </span>
        ) : (
          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] text-primary">
            בתהליך
          </span>
        )}
        <ChevronLeft className="mr-2 h-4 w-4 text-muted-foreground rtl:rotate-180" />
      </div>
    </Link>
  );
}
