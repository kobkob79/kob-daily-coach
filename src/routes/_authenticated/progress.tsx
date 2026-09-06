/**
 * Trends — rebuilt from scratch (previous version read from the legacy
 * `workouts` table, which real sessions haven't written to since the app
 * moved to workout_sessions/workout_sets; its "workout volume" chart was
 * effectively always empty).
 *
 * Three sections, each answering a different question:
 * - workout consistency + volume, from the real session data
 * - nutrition (calories/protein), unchanged — nutrition_entries.date was
 *   already correct
 * - pain by area, consolidated into one multi-line chart instead of a
 *   separate card per area
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { subDays, format, eachDayOfInterval, startOfWeek, eachWeekOfInterval } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { listSessions } from "@/lib/workout-session";
import { t } from "@/lib/i18n";
import { normalizeMuscleGroup, MUSCLE_GROUPS } from "@/lib/muscle-groups";

export const Route = createFileRoute("/_authenticated/progress")({
  component: ProgressPage,
});

const AREAS = ["neck", "sciatica", "ac_joint", "general"] as const;
const AREA_COLOR: Record<(typeof AREAS)[number], string> = {
  neck: "var(--color-destructive)",
  sciatica: "var(--color-primary)",
  ac_joint: "var(--color-accent)",
  general: "var(--color-muted-foreground)",
};

const MUSCLE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-primary)",
  "var(--color-accent)",
  "var(--color-destructive)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-muted-foreground)",
];

function ProgressPage() {
  const start = subDays(new Date(), 29);
  const startIso = format(start, "yyyy-MM-dd");
  const days = eachDayOfInterval({ start, end: new Date() }).map((d) => format(d, "yyyy-MM-dd"));

  const sessionsQ = useQuery({
    queryKey: ["progress", "sessions"],
    queryFn: () => listSessions(200),
  });

  const setsQ = useQuery({
    queryKey: [
      "progress",
      "sets",
      format(startOfWeek(subDays(new Date(), 55), { weekStartsOn: 0 }), "yyyy-MM-dd"),
    ],
    queryFn: async () => {
      const wStart = startOfWeek(subDays(new Date(), 55), { weekStartsOn: 0 });
      const { data, error } = await supabase
        .from("workout_sets")
        .select(
          `
          weight_kg,
          reps,
          workout_sessions!inner(started_at, status),
          exercises(muscle_group)
        `,
        )
        .not("completed_at", "is", null)
        .eq("workout_sessions.status", "completed")
        .gte("workout_sessions.started_at", format(wStart, "yyyy-MM-dd"));
      if (error) throw error;
      return data as unknown as {
        weight_kg: number | null;
        reps: number | null;
        workout_sessions: { started_at: string; status: string };
        exercises: { muscle_group: string | null } | null;
      }[];
    },
  });

  const nutritionQ = useQuery({
    queryKey: ["progress", "nutrition", startIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_entries")
        .select("date, calories, protein_g")
        .gte("date", startIso);
      if (error) throw error;
      return data;
    },
  });

  const healthQ = useQuery({
    queryKey: ["progress", "health", startIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("health_logs")
        .select("date, area, pain_level")
        .gte("date", startIso);
      if (error) throw error;
      return data;
    },
  });

  const completedSessions = (sessionsQ.data ?? []).filter(
    (s) => s.status === "completed" && new Date(s.started_at) >= start,
  );

  // Sessions per week, last 8 weeks.
  const weekStart = startOfWeek(subDays(new Date(), 55), { weekStartsOn: 0 });
  const weeks = eachWeekOfInterval({ start: weekStart, end: new Date() }, { weekStartsOn: 0 });
  const consistencyData = weeks.map((wStart) => {
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 7);
    const count = (sessionsQ.data ?? []).filter((s) => {
      if (s.status !== "completed") return false;
      const d = new Date(s.started_at);
      return d >= wStart && d < wEnd;
    }).length;
    return { week: format(wStart, "d/M"), sessions: count };
  });

  // Volume per muscle group, last 8 weeks.
  const allSets = setsQ.data ?? [];
  const activeMuscles = new Set<string>();

  const muscleVolumeData = weeks.map((wStart) => {
    const wEnd = new Date(wStart);
    wEnd.setDate(wEnd.getDate() + 7);
    const weekSets = allSets.filter((s) => {
      const d = new Date(s.workout_sessions.started_at);
      return d >= wStart && d < wEnd;
    });

    const row: Record<string, string | number> = { week: format(wStart, "d/M") };
    for (const set of weekSets) {
      const muscle = normalizeMuscleGroup(set.exercises?.muscle_group);
      const vol = (set.weight_kg ?? 0) * (set.reps ?? 0);
      if (vol > 0) {
        row[muscle] = ((row[muscle] as number) ?? 0) + vol;
        activeMuscles.add(muscle);
      }
    }
    return row;
  });

  const visibleMuscles = MUSCLE_GROUPS.filter((m) => activeMuscles.has(m));

  // Training volume per day, last 30 days.
  const volumeData = days.map((d) => ({
    date: format(new Date(d), "d/M"),
    volume: completedSessions
      .filter((s) => format(new Date(s.started_at), "yyyy-MM-dd") === d)
      .reduce((sum, s) => sum + (s.total_volume_kg ?? 0), 0),
  }));

  const nutritionData = days.map((d) => {
    const rows = nutritionQ.data?.filter((n) => n.date === d) ?? [];
    return {
      date: format(new Date(d), "d/M"),
      kcal: rows.reduce((s, r) => s + (r.calories ?? 0), 0),
      protein: Math.round(rows.reduce((s, r) => s + Number(r.protein_g ?? 0), 0)),
    };
  });

  const painData = days.map((d) => {
    const row: Record<string, string | number | null> = { date: format(new Date(d), "d/M") };
    for (const area of AREAS) {
      const rows = healthQ.data?.filter((h) => h.area === area && h.date === d) ?? [];
      row[area] = rows.length
        ? rows.reduce((s, r) => s + (r.pain_level ?? 0), 0) / rows.length
        : null;
    }
    return row;
  });
  const hasPainData = (healthQ.data ?? []).length > 0;

  const totalSessions30d = completedSessions.length;
  const totalVolume30d = Math.round(
    completedSessions.reduce((s, r) => s + (r.total_volume_kg ?? 0), 0),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("progress.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("progress.subtitle")}</p>
      </div>

      <ChartCard
        title="עקביות אימונים"
        subtitle={`${totalSessions30d} אימונים הושלמו ב-30 הימים האחרונים`}
      >
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={consistencyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              width={24}
            />
            <Tooltip contentStyle={tipStyle} />
            <Bar dataKey="sessions" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="נפח אימון" subtitle={`${totalVolume30d.toLocaleString("he-IL")} ק"ג סה"כ`}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={volumeData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              interval={4}
            />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} width={36} />
            <Tooltip contentStyle={tipStyle} />
            <Line
              type="monotone"
              dataKey="volume"
              stroke="var(--color-primary)"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {visibleMuscles.length > 0 && (
        <ChartCard title="נפח לפי קבוצת שריר">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={muscleVolumeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} width={36} />
              <Tooltip contentStyle={tipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {visibleMuscles.map((muscle, i) => (
                <Bar
                  key={muscle}
                  dataKey={muscle}
                  stackId="a"
                  fill={MUSCLE_COLORS[i % MUSCLE_COLORS.length]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <ChartCard title={t("progress.chart.nutrition")}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={nutritionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
              interval={4}
            />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} width={32} />
            <Tooltip contentStyle={tipStyle} />
            <Line
              type="monotone"
              dataKey="kcal"
              stroke="var(--color-primary)"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="protein"
              stroke="var(--color-accent)"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {hasPainData && (
        <ChartCard title="כאב לפי אזור">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={painData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                interval={4}
              />
              <YAxis
                domain={[0, 10]}
                tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                width={22}
              />
              <Tooltip contentStyle={tipStyle} />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(area) => t(`health.area.${area}`)}
              />
              {AREAS.map((area) => (
                <Line
                  key={area}
                  type="monotone"
                  dataKey={area}
                  stroke={AREA_COLOR[area]}
                  strokeWidth={2}
                  connectNulls
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}

const tipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
};

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {subtitle && <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
      {!subtitle && <div className="mb-2" />}
      {children}
    </div>
  );
}
