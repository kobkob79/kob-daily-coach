import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { subDays, format, eachDayOfInterval } from "date-fns";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/progress")({
  component: ProgressPage,
});

const AREA_HE: Record<string, string> = { neck: "צוואר", sciatica: "גב תחתון", ac_joint: "כתף" };

function ProgressPage() {
  const start = subDays(new Date(), 29);
  const startIso = format(start, "yyyy-MM-dd");
  const days = eachDayOfInterval({ start, end: new Date() }).map((d) => format(d, "yyyy-MM-dd"));

  const workoutsQ = useQuery({
    queryKey: ["progress", "workouts", startIso],
    queryFn: async () => {
      const { data, error } = await supabase.from("workouts").select("date, duration_min").gte("date", startIso);
      if (error) throw error;
      return data;
    },
  });

  const nutritionQ = useQuery({
    queryKey: ["progress", "nutrition", startIso],
    queryFn: async () => {
      const { data, error } = await supabase.from("nutrition_entries").select("date, calories, protein_g").gte("date", startIso);
      if (error) throw error;
      return data;
    },
  });

  const healthQ = useQuery({
    queryKey: ["progress", "health", startIso],
    queryFn: async () => {
      const { data, error } = await supabase.from("health_logs").select("date, area, pain_level, mobility_score").gte("date", startIso);
      if (error) throw error;
      return data;
    },
  });

  const workoutData = days.map((d) => ({
    date: format(new Date(d), "d/M"),
    minutes: workoutsQ.data?.filter((w) => w.date === d).reduce((s, w) => s + (w.duration_min ?? 0), 0) ?? 0,
  }));

  const nutritionData = days.map((d) => {
    const rows = nutritionQ.data?.filter((n) => n.date === d) ?? [];
    return {
      date: format(new Date(d), "d/M"),
      kcal: rows.reduce((s, r) => s + (r.calories ?? 0), 0),
      protein: Math.round(rows.reduce((s, r) => s + Number(r.protein_g ?? 0), 0)),
    };
  });

  const painByArea = ["neck", "sciatica", "ac_joint"].map((area) => ({
    area,
    data: days.map((d) => {
      const rows = healthQ.data?.filter((h) => h.area === area && h.date === d) ?? [];
      const avg = rows.length ? rows.reduce((s, r) => s + (r.pain_level ?? 0), 0) / rows.length : null;
      return { date: format(new Date(d), "d/M"), pain: avg };
    }),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("progress.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("progress.subtitle")}</p>
      </div>

      <ChartCard title={t("progress.chart.volume")}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={workoutData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} interval={4} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} width={28} />
            <Tooltip contentStyle={tipStyle} />
            <Bar dataKey="minutes" fill="var(--color-primary)" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t("progress.chart.nutrition")}>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={nutritionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} interval={4} />
            <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} width={32} />
            <Tooltip contentStyle={tipStyle} />
            <Line type="monotone" dataKey="kcal" stroke="var(--color-primary)" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="protein" stroke="var(--color-accent)" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {painByArea.map((series) => (
        <ChartCard key={series.area} title={t("progress.chart.pain").replace("{area}", AREA_HE[series.area] ?? series.area)}>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={series.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} interval={4} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} width={22} />
              <Tooltip contentStyle={tipStyle} />
              <Line type="monotone" dataKey="pain" stroke="var(--color-destructive)" strokeWidth={2} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      ))}
    </div>
  );
}

const tipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface-card p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
