/**
 * Derive personalised coach memory from the user's own history.
 *
 * Everything is computed from persistent Supabase data — no localStorage.
 * The result is fed to `buildCoachHints` so the coach can reference
 * habits ("you usually eat cottage around 04:30"), missing supplements
 * and weight trend without ever asking the user for that info.
 *
 * The same aggregated snapshot is also mirrored into the `ai_memory`
 * table so future server-side AI features can read it directly.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format } from "date-fns";
import { setMemory } from "@/lib/ai-memory";
import type { CoachMemory } from "@/lib/timeline";

const LOOKBACK_DAYS = 30;

export function useCoachMemory(bioDay: string) {
  const q = useQuery({
    queryKey: ["coach-memory", bioDay],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CoachMemory> => {
      const from = format(subDays(new Date(), LOOKBACK_DAYS), "yyyy-MM-dd");

      const [events, meals, health] = await Promise.all([
        supabase
          .from("daily_events")
          .select("kind,label,amount,unit,event_time,biological_day")
          .gte("biological_day", from),
        supabase
          .from("nutrition_entries")
          .select("food_name,meal_type,meal_time,biological_day,protein_g")
          .gte("biological_day", from),
        supabase
          .from("health_logs")
          .select("area,pain_level,date")
          .gte("date", from)
          .order("date", { ascending: true }),
      ]);

      const evRows = events.data ?? [];
      const mealRows = meals.data ?? [];
      const healthRows = health.data ?? [];

      // --- Supplements: which do you normally take, and which are missing today?
      const supplementCounts = new Map<string, number>();
      const supplementsToday = new Set<string>();
      for (const e of evRows) {
        if (e.kind !== "supplement" || !e.label) continue;
        supplementCounts.set(e.label, (supplementCounts.get(e.label) ?? 0) + 1);
        if (e.biological_day === bioDay) supplementsToday.add(e.label);
      }
      const supplementsMissingToday = [...supplementCounts.entries()]
        .filter(([, c]) => c >= 3) // habitual (3+ occurrences in the last 30d)
        .filter(([name]) => !supplementsToday.has(name))
        .slice(0, 2)
        .map(([name]) => ({ name }));

      // --- Meal habit hint: most common food for current period of day.
      const hour = new Date().getHours();
      const period: "morning" | "day" | "evening" | "night" =
        hour < 5 ? "night" : hour < 11 ? "morning" : hour < 17 ? "day" : hour < 22 ? "evening" : "night";
      const foodCounts = new Map<string, { count: number; hours: number[] }>();
      for (const m of mealRows) {
        if (!m.food_name || !m.meal_time) continue;
        const h = Number(m.meal_time.slice(0, 2));
        const p = h < 5 ? "night" : h < 11 ? "morning" : h < 17 ? "day" : h < 22 ? "evening" : "night";
        if (p !== period) continue;
        const cur = foodCounts.get(m.food_name) ?? { count: 0, hours: [] };
        cur.count += 1;
        cur.hours.push(h * 60 + Number(m.meal_time.slice(3, 5)));
        foodCounts.set(m.food_name, cur);
      }
      const topFood = [...foodCounts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
      let mealHabitHint: CoachMemory["mealHabitHint"] = null;
      if (topFood && topFood[1].count >= 3) {
        const avg = Math.round(topFood[1].hours.reduce((a, b) => a + b, 0) / topFood[1].hours.length);
        const hh = String(Math.floor(avg / 60)).padStart(2, "0");
        const mm = String(avg % 60).padStart(2, "0");
        mealHabitHint = { time: `${hh}:${mm}`, food: topFood[0] };
      }

      // --- Weight trend: compare newest vs oldest weight entry in window.
      const weights = evRows
        .filter((e) => e.kind === "weight" && e.amount != null)
        .map((e) => ({ t: new Date(e.event_time).getTime(), kg: Number(e.amount) }))
        .sort((a, b) => a.t - b.t);
      let weightTrend30d: CoachMemory["weightTrend30d"] = null;
      if (weights.length >= 2) {
        const delta = weights[weights.length - 1].kg - weights[0].kg;
        weightTrend30d = { deltaKg: Math.round(delta * 10) / 10 };
      }

      return { supplementsMissingToday, mealHabitHint, weightTrend30d };
    },
  });

  // Mirror snapshot into ai_memory for future server-side consumers.
  useEffect(() => {
    if (!q.data) return;
    void setMemory("meal_habits", q.data.mealHabitHint ?? {});
    void setMemory("supplements", q.data.supplementsMissingToday ?? []);
    void setMemory("weight_trend", q.data.weightTrend30d ?? {});
  }, [q.data]);

  return q.data ?? null;
}
