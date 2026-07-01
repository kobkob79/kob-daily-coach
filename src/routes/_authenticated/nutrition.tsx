import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { today } from "@/lib/date";

export const Route = createFileRoute("/_authenticated/nutrition")({
  component: NutritionPage,
});

const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
type Meal = typeof MEALS[number];

function NutritionPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(today());

  const [meal, setMeal] = useState<Meal>("breakfast");
  const [food, setFood] = useState("");
  const [cal, setCal] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [f, setF] = useState("");

  const entriesQ = useQuery({
    queryKey: ["nutrition", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("nutrition_entries").select("*").eq("date", date).order("meal");
      if (error) throw error;
      return data;
    },
  });

  const addEntry = useMutation({
    mutationFn: async () => {
      if (!food.trim()) throw new Error("Food name required");
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not signed in");
      const { error } = await supabase.from("nutrition_entries").insert({
        user_id: userRes.user.id,
        date,
        meal,
        food_name: food.trim(),
        calories: cal ? Number(cal) : null,
        protein_g: p ? Number(p) : null,
        carbs_g: c ? Number(c) : null,
        fat_g: f ? Number(f) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nutrition", date] });
      setFood(""); setCal(""); setP(""); setC(""); setF("");
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nutrition_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nutrition", date] }),
  });

  const totals = (entriesQ.data ?? []).reduce(
    (acc, e) => ({
      cal: acc.cal + (e.calories ?? 0),
      p: acc.p + Number(e.protein_g ?? 0),
      c: acc.c + Number(e.carbs_g ?? 0),
      f: acc.f + Number(e.fat_g ?? 0),
    }),
    { cal: 0, p: 0, c: 0, f: 0 },
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Nutrition</h1>
        <p className="text-sm text-muted-foreground">Log meals and macros.</p>
      </div>

      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full" />

      <section className="grid grid-cols-4 gap-2">
        <Totals label="kcal" value={totals.cal} />
        <Totals label="P" value={Math.round(totals.p)} accent />
        <Totals label="C" value={Math.round(totals.c)} />
        <Totals label="F" value={Math.round(totals.f)} />
      </section>

      <div className="surface-card space-y-3 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Add entry</h3>
        <div className="grid grid-cols-2 gap-2">
          <Select value={meal} onValueChange={(v) => setMeal(v as Meal)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MEALS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Food" value={food} onChange={(e) => setFood(e.target.value)} />
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div><Label className="text-xs">kcal</Label><Input inputMode="numeric" value={cal} onChange={(e) => setCal(e.target.value)} /></div>
          <div><Label className="text-xs">P</Label><Input inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} /></div>
          <div><Label className="text-xs">C</Label><Input inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} /></div>
          <div><Label className="text-xs">F</Label><Input inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} /></div>
        </div>
        <Button onClick={() => addEntry.mutate()} disabled={addEntry.isPending} className="w-full">
          <Plus className="mr-1 h-4 w-4" /> Add
        </Button>
      </div>

      <div className="space-y-2">
        {MEALS.map((m) => {
          const items = entriesQ.data?.filter((e) => e.meal === m) ?? [];
          if (!items.length) return null;
          return (
            <div key={m} className="surface-card p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">{m}</h4>
              <div className="space-y-1">
                {items.map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-1.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.food_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.calories ?? 0} kcal · P{Math.round(Number(e.protein_g ?? 0))} C{Math.round(Number(e.carbs_g ?? 0))} F{Math.round(Number(e.fat_g ?? 0))}
                      </p>
                    </div>
                    <button onClick={() => remove.mutate(e.id)} className="text-muted-foreground hover:text-destructive shrink-0 ml-2">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {!entriesQ.data?.length && (
          <p className="text-center text-sm text-muted-foreground py-6">No entries for this day yet.</p>
        )}
      </div>
    </div>
  );
}

function Totals({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="surface-card p-3 text-center">
      <p className={`text-lg font-bold ${accent ? "text-primary" : ""}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
