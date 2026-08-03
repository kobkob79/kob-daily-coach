/**
 * Personal exercise intelligence — derives "my relationship with this exercise"
 * from existing workout history rows. Pure functions, no data access here.
 */

export interface StatSet {
  reps: number | null;
  weight_kg: number | null;
  completed_at: string | null;
  actual_rest_seconds: number | null;
  session_id: string | null;
  /** Session start time, used when a set has no completion timestamp. */
  session_at: string | null;
}

export type Trend = "improving" | "stable" | "declining" | "unknown";

export interface ExerciseStats {
  timesPerformed: number;
  firstPerformedAt: string | null;
  lastPerformedAt: string | null;
  daysSinceLast: number | null;
  lastPerformance: { weightKg: number | null; reps: number | null; at: string | null } | null;
  records: {
    heaviestKg: number | null;
    mostReps: number | null;
    best1RM: number | null;
    bestSessionVolume: number | null;
  };
  averages: {
    weightKg: number | null;
    reps: number | null;
    sessionVolume: number | null;
    restSeconds: number | null;
  };
  completionRate: number | null;
  trend: Trend;
}

const DAY = 86_400_000;

function setTime(s: StatSet): string | null {
  return s.completed_at ?? s.session_at ?? null;
}

function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round(n: number | null, digits = 1): number | null {
  if (n == null) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function computeExerciseStats(sets: StatSet[]): ExerciseStats {
  const done = sets.filter((s) => s.completed_at != null || s.reps != null || s.weight_kg != null);
  const completed = sets.filter((s) => s.completed_at != null);
  const completionRate = sets.length ? completed.length / sets.length : null;

  const withTime = done
    .map((s) => ({ s, t: setTime(s) }))
    .filter((x): x is { s: StatSet; t: string } => !!x.t)
    .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());

  // Group by session for volume metrics.
  const bySession = new Map<string, { volume: number; at: string | null }>();
  for (const s of done) {
    const key = s.session_id ?? `single:${setTime(s) ?? Math.random()}`;
    const vol = (s.weight_kg ?? 0) * (s.reps ?? 0);
    const prev = bySession.get(key);
    bySession.set(key, {
      volume: (prev?.volume ?? 0) + vol,
      at: prev?.at ?? setTime(s),
    });
  }
  const sessions = [...bySession.values()]
    .filter((x) => !!x.at)
    .sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime());

  const weights = done.map((s) => s.weight_kg).filter((n): n is number => n != null && n > 0);
  const reps = done.map((s) => s.reps).filter((n): n is number => n != null && n > 0);
  const rests = done
    .map((s) => s.actual_rest_seconds)
    .filter((n): n is number => n != null && n > 0);

  let best1RM: number | null = null;
  for (const s of done) {
    if (s.weight_kg != null && s.weight_kg > 0 && s.reps != null && s.reps > 0) {
      const e = epley(s.weight_kg, s.reps);
      if (best1RM == null || e > best1RM) best1RM = e;
    }
  }

  const lastSet = withTime.at(-1)?.s ?? null;
  const firstAt = sessions[0]?.at ?? withTime[0]?.t ?? null;
  const lastAt = sessions.at(-1)?.at ?? withTime.at(-1)?.t ?? null;

  // Trend: mean session volume of the last 3 sessions vs the 3 before them.
  let trend: Trend = "unknown";
  if (sessions.length >= 4) {
    const vols = sessions.map((s) => s.volume);
    const recent = avg(vols.slice(-3))!;
    const older = avg(vols.slice(-6, -3))!;
    if (older > 0) {
      const delta = (recent - older) / older;
      trend = delta > 0.05 ? "improving" : delta < -0.05 ? "declining" : "stable";
    }
  } else if (sessions.length >= 2) {
    trend = "stable";
  }

  return {
    timesPerformed: sessions.length,
    firstPerformedAt: firstAt,
    lastPerformedAt: lastAt,
    daysSinceLast: lastAt ? Math.floor((Date.now() - new Date(lastAt).getTime()) / DAY) : null,
    lastPerformance: lastSet
      ? { weightKg: lastSet.weight_kg, reps: lastSet.reps, at: setTime(lastSet) }
      : null,
    records: {
      heaviestKg: weights.length ? Math.max(...weights) : null,
      mostReps: reps.length ? Math.max(...reps) : null,
      best1RM: round(best1RM),
      bestSessionVolume: sessions.length ? round(Math.max(...sessions.map((s) => s.volume))) : null,
    },
    averages: {
      weightKg: round(avg(weights)),
      reps: round(avg(reps)),
      sessionVolume: round(avg(sessions.map((s) => s.volume))),
      restSeconds: round(avg(rests), 0),
    },
    completionRate,
    trend,
  };
}

export const TREND_META: Record<Trend, { icon: string; label: string; tone: string }> = {
  improving: { icon: "📈", label: "משתפר", tone: "bg-success/15 text-success" },
  stable: { icon: "➡", label: "יציב", tone: "bg-primary/15 text-primary" },
  declining: { icon: "📉", label: "בירידה", tone: "bg-destructive/15 text-destructive" },
  unknown: { icon: "•", label: "אין מספיק נתונים", tone: "bg-muted/40 text-muted-foreground" },
};

export interface SmartBadge {
  emoji: string;
  label: string;
  tone: string;
}

/** Auto-generated badges describing the user's relationship with the exercise. */
export function smartBadges(
  stats: ExerciseStats,
  opts: { isFavorite: boolean; routines: string[]; totalSessionsAllExercises?: number },
): SmartBadge[] {
  const out: SmartBadge[] = [];
  if (stats.timesPerformed === 0) {
    out.push({ emoji: "🆕", label: "טרם בוצע", tone: "bg-primary/15 text-primary" });
  }
  if (opts.isFavorite) {
    out.push({ emoji: "🔥", label: "מועדף אישי", tone: "bg-destructive/15 text-destructive" });
  }
  if (stats.timesPerformed >= 5) {
    out.push({ emoji: "💪", label: "בשימוש תכוף", tone: "bg-success/15 text-success" });
  }
  if (stats.trend === "improving") {
    out.push({ emoji: "⭐", label: "שיא בהישג יד", tone: "bg-accent/15 text-accent" });
  }
  if (stats.daysSinceLast != null && stats.daysSinceLast >= 21) {
    out.push({
      emoji: "⏳",
      label: `${stats.daysSinceLast} ימים מאז הפעם האחרונה`,
      tone: "bg-muted/40 text-muted-foreground",
    });
  }
  if (opts.routines.length > 0 && (stats.daysSinceLast == null || stats.daysSinceLast >= 4)) {
    out.push({ emoji: "🎯", label: "מומלץ להיום", tone: "bg-primary/15 text-primary" });
  }
  return out;
}

export function formatHebDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatRest(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s} שנ׳`;
}
