/**
 * Unified History hub — everything that used to just "disappear" once the
 * day/session ended, browsable by category. Meals and workouts today;
 * more categories can slot in as their own tab later.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { he } from "date-fns/locale";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { MealCard, type Meal } from "@/components/nutrition/MealCard";
import { WorkoutHistoryList } from "@/components/history/WorkoutHistoryList";

type HistoryTab = "meals" | "workouts";

export const Route = createFileRoute("/_authenticated/history")({
  validateSearch: (s: Record<string, unknown>): { tab: HistoryTab } => ({
    tab: s.tab === "workouts" ? "workouts" : "meals",
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard">
            <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" /> חזור
          </Link>
        </Button>
        <h1 className="text-lg font-bold">היסטוריה</h1>
        <div className="w-16" />
      </div>

      <Tabs value={tab} onValueChange={(v) => navigate({ search: { tab: v as HistoryTab } })}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="meals">ארוחות</TabsTrigger>
          <TabsTrigger value="workouts">כושר</TabsTrigger>
        </TabsList>
        <TabsContent value="meals" className="mt-4">
          <MealHistoryList />
        </TabsContent>
        <TabsContent value="workouts" className="mt-4">
          <WorkoutHistoryList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface DayBucket {
  day: string;
  meals: Meal[];
  totalCalories: number;
}

function MealHistoryList() {
  const q = useQuery({
    queryKey: ["meals-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_entries")
        .select("*")
        .order("biological_day", { ascending: false })
        .order("meal_time", { ascending: true, nullsFirst: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as unknown as Meal[];
    },
  });

  const days: DayBucket[] = [];
  const byDay = new Map<string, Meal[]>();
  for (const m of q.data ?? []) {
    const key = m.biological_day ?? m.date;
    if (!byDay.has(key)) {
      byDay.set(key, []);
      days.push({ day: key, meals: [], totalCalories: 0 });
    }
    byDay.get(key)!.push(m);
  }
  for (const bucket of days) {
    bucket.meals = byDay.get(bucket.day) ?? [];
    bucket.totalCalories = Math.round(bucket.meals.reduce((sum, m) => sum + (m.calories ?? 0), 0));
  }

  const [expanded, setExpanded] = useState<string | null>(null);

  if (q.isLoading) {
    return <p className="text-center text-sm text-muted-foreground">טוען…</p>;
  }
  if (days.length === 0) {
    return <p className="text-center text-sm text-muted-foreground">אין ארוחות רשומות עדיין.</p>;
  }

  return (
    <div className="space-y-2">
      {days.map((bucket) => (
        <DayCard
          key={bucket.day}
          bucket={bucket}
          isOpen={expanded === bucket.day}
          onToggle={() => setExpanded((cur) => (cur === bucket.day ? null : bucket.day))}
        />
      ))}
    </div>
  );
}

function DayCard({
  bucket,
  isOpen,
  onToggle,
}: {
  bucket: DayBucket;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const dateStr = format(parseISO(bucket.day), "EEEE, d בMMMM yyyy", { locale: he });

  // Signed URLs only fetched once this day is actually expanded.
  const photoPaths = isOpen
    ? (bucket.meals.map((m) => m.photo_url).filter(Boolean) as string[])
    : [];
  const photoQueries = useQueries({
    queries: photoPaths.map((p) => ({
      queryKey: ["meal-photo", p],
      queryFn: async () => {
        const { data } = await supabase.storage.from("meal-photos").createSignedUrl(p, 3600);
        return data?.signedUrl ?? null;
      },
      staleTime: 60 * 50 * 1000,
    })),
  });
  const photoMap = new Map<string, string | null>();
  photoPaths.forEach((p, i) => photoMap.set(p, photoQueries[i]?.data ?? null));

  return (
    <div className="surface-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 p-4 text-start"
      >
        <div>
          <p className="text-sm font-semibold">{dateStr}</p>
          <p className="text-xs text-muted-foreground">
            {bucket.meals.length} ארוחות
            {bucket.totalCalories > 0 ? ` · ${bucket.totalCalories} קק״ל` : ""}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && (
        <div className="space-y-2 border-t border-border/60 p-3">
          {bucket.meals.map((m) => (
            <MealCard
              key={m.id}
              meal={m}
              photoUrl={m.photo_url ? (photoMap.get(m.photo_url) ?? null) : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
