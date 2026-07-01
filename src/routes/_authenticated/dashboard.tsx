import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getShiftForDate, SHIFT_STYLES, type ShiftConfig } from "@/lib/shift";
import { format } from "date-fns";
import { Dumbbell, Apple, HeartPulse, CalendarClock, Flame, TrendingUp } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { today } from "@/lib/date";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const todayIso = today();

  const shiftQ = useQuery({
    queryKey: ["shift-config"],
    queryFn: async () => {
      const { data } = await supabase.from("shift_config").select("*").maybeSingle();
      return data as ShiftConfig | null;
    },
  });

  const workoutsQ = useQuery({
    queryKey: ["workouts", "recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("workouts")
        .select("id,name,date,duration_min")
        .order("date", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  const nutritionTodayQ = useQuery({
    queryKey: ["nutrition", todayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("nutrition_entries")
        .select("calories,protein_g")
        .eq("date", todayIso);
      return data ?? [];
    },
  });

  const healthQ = useQuery({
    queryKey: ["health", "recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("health_logs")
        .select("area,pain_level,date")
        .order("date", { ascending: false })
        .limit(3);
      return data ?? [];
    },
  });

  const cal = nutritionTodayQ.data?.reduce((s, r) => s + (r.calories ?? 0), 0) ?? 0;
  const protein = nutritionTodayQ.data?.reduce((s, r) => s + Number(r.protein_g ?? 0), 0) ?? 0;
  const shift = shiftQ.data ? getShiftForDate(shiftQ.data, new Date()) : null;
  const shiftStyle = shift ? SHIFT_STYLES[shift] : null;

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-5">
      <section>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{format(new Date(), "EEEE, d MMMM")}</p>
        <h1 className="mt-1 text-2xl font-bold">{greeting}.</h1>
      </section>

      {shiftStyle && (
        <Link to="/shift" className={`surface-card flex items-center justify-between p-4 border ${shiftStyle.className}`}>
          <div className="flex items-center gap-3">
            <CalendarClock className="h-5 w-5" />
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">Today's shift</p>
              <p className="text-lg font-semibold">{shiftStyle.label}</p>
            </div>
          </div>
          <span className={`h-3 w-3 rounded-full ${shiftStyle.dot}`} />
        </Link>
      )}

      <section className="grid grid-cols-2 gap-3">
        <StatCard icon={<Flame className="h-4 w-4" />} label="Calories today" value={cal.toString()} accent />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Protein (g)" value={Math.round(protein).toString()} />
      </section>

      <QuickGrid />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent workouts</h2>
        <div className="surface-card divide-y divide-border">
          {workoutsQ.data?.length ? workoutsQ.data.map((w) => (
            <div key={w.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium">{w.name ?? "Workout"}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(w.date), "EEE d MMM")}</p>
              </div>
              <span className="text-xs text-muted-foreground">{w.duration_min ?? "—"} min</span>
            </div>
          )) : <p className="px-4 py-6 text-sm text-muted-foreground">No workouts logged yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent health checks</h2>
        <div className="surface-card divide-y divide-border">
          {healthQ.data?.length ? healthQ.data.map((h, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium capitalize">{h.area.replace("_", " ")}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(h.date), "EEE d MMM")}</p>
              </div>
              <span className="text-xs">Pain <b className="text-primary">{h.pain_level ?? "—"}</b>/10</span>
            </div>
          )) : <p className="px-4 py-6 text-sm text-muted-foreground">Log neck / sciatica / AC joint to build a baseline.</p>}
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="surface-card p-4">
      <div className={`flex items-center gap-1.5 text-xs ${accent ? "text-primary" : "text-muted-foreground"}`}>
        {icon}<span className="uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function QuickGrid() {
  const items = [
    { to: "/workouts", label: "Log workout", icon: Dumbbell },
    { to: "/nutrition", label: "Log meal", icon: Apple },
    { to: "/health", label: "Log health", icon: HeartPulse },
  ] as const;
  return (
    <section className="grid grid-cols-3 gap-3">
      {items.map((i) => {
        const Icon = i.icon;
        return (
          <Link key={i.to} to={i.to} className="surface-card flex flex-col items-center gap-2 p-4 text-center hover:border-primary/50 transition">
            <Icon className="h-5 w-5 text-primary" />
            <span className="text-xs font-medium">{i.label}</span>
          </Link>
        );
      })}
    </section>
  );
}
