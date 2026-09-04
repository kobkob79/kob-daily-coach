/**
 * Plain-text export of a finished workout — every set's weight and reps,
 * in copy/paste-friendly Hebrew, optionally followed by Viora's debrief.
 */
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import {
  detectPRs,
  getSession,
  getSessionSets,
  isCardioMuscleGroup,
  type SessionSet,
} from "@/lib/workout-session";
import type { CoachDebrief } from "@/lib/coach-debrief.functions";

function formatSetLine(s: SessionSet): string {
  const w = s.weight_kg;
  const r = s.reps;
  if (w != null && w > 0) return `${w} ק"ג × ${r ?? "—"}`;
  if (r != null) return `${r} חזרות`;
  return "—";
}

function formatCardioLine(sets: SessionSet[]): string {
  const done = sets.filter((s) => s.completed_at);
  const totalSec = done.reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
  const minutes = Math.round(totalSec / 60);
  const speeds = done.map((s) => s.avg_speed_kmh).filter((v): v is number => v != null);
  const avgSpeed = speeds.length
    ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10
    : null;
  return avgSpeed != null ? `${minutes} דקות · ${avgSpeed} קמ"ש ממוצע` : `${minutes} דקות`;
}

/**
 * Builds the full copy/paste text for a completed session: date, every
 * exercise with its actual weight × reps per set, totals, and — when
 * supplied — the AI debrief shown on screen (it's never persisted, so the
 * caller must pass whatever it currently has in memory).
 */
export async function buildWorkoutExportText(
  sessionId: string,
  debrief?: CoachDebrief | null,
): Promise<string> {
  const [session, sets, u] = await Promise.all([
    getSession(sessionId),
    getSessionSets(sessionId),
    supabase.auth.getUser(),
  ]);
  if (!session) return "";

  const exerciseIds = Array.from(new Set(sets.map((s) => s.exercise_id)));
  const [exRes, prs] = await Promise.all([
    exerciseIds.length
      ? supabase.from("exercises").select("id,name,muscle_group").in("id", exerciseIds)
      : Promise.resolve({
          data: [] as { id: string; name: string; muscle_group: string | null }[],
        }),
    u.data.user
      ? detectPRs(u.data.user.id, sessionId, sets)
      : Promise.resolve({} as Record<string, boolean>),
  ]);
  const exById = new Map((exRes.data ?? []).map((e) => [e.id, e] as const));

  // Group by exercise, preserving the order they were performed in (sets
  // come back ordered by position).
  const order: string[] = [];
  const byExercise = new Map<string, SessionSet[]>();
  for (const s of sets) {
    if (!byExercise.has(s.exercise_id)) {
      byExercise.set(s.exercise_id, []);
      order.push(s.exercise_id);
    }
    byExercise.get(s.exercise_id)!.push(s);
  }

  const lines: string[] = [];
  lines.push(`אימון${session.name ? ` — ${session.name}` : ""}`);
  const dateStr = format(new Date(session.started_at), "EEEE, d בMMMM yyyy", { locale: he });
  const durationMin = session.duration_seconds ? Math.round(session.duration_seconds / 60) : null;
  lines.push(durationMin != null ? `${dateStr} · ${durationMin} דקות` : dateStr);
  lines.push("");

  for (const exId of order) {
    const exSets = (byExercise.get(exId) ?? []).sort((a, b) => a.set_number - b.set_number);
    const done = exSets.filter((s) => s.completed_at);
    const ex = exById.get(exId);
    const name = ex?.name ?? "תרגיל";
    const isPR = prs[exId] ?? false;

    if (isCardioMuscleGroup(ex?.muscle_group ?? null)) {
      lines.push(`${name} — ${formatCardioLine(exSets)}`);
    } else {
      lines.push(`${name}${isPR ? " 🏆" : ""}`);
      for (const s of done) lines.push(`  ${formatSetLine(s)}`);
      if (done.length < exSets.length) {
        lines.push(`  (${done.length}/${exSets.length} סטים הושלמו)`);
      }
    }
    lines.push("");
  }

  const totalVolume = Math.round(
    sets.reduce((sum, s) => sum + (s.completed_at ? (s.weight_kg ?? 0) * (s.reps ?? 0) : 0), 0),
  );
  const prCount = Object.values(prs).filter(Boolean).length;
  lines.push(
    `נפח כולל: ${totalVolume.toLocaleString("he-IL")} ק"ג` +
      (prCount > 0 ? ` · שיאים אישיים: ${prCount} 🏆` : ""),
  );

  if (debrief && !debrief.unavailable) {
    lines.push("");
    lines.push("חוות דעת של ויורה:");
    if (debrief.greeting) lines.push(debrief.greeting);
    for (const p of debrief.paragraphs) lines.push(p);
    if (debrief.highlights.length > 0) {
      lines.push("");
      for (const h of debrief.highlights) lines.push(`• ${h}`);
    }
  }

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
