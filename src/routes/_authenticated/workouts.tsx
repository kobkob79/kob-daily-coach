import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { today } from "@/lib/date";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/workouts")({
  component: WorkoutsPage,
});

const CATEGORIES = ["push", "pull", "legs", "core", "mobility", "conditioning"] as const;

function WorkoutsPage() {
  const qc = useQueryClient();
  const [openWorkout, setOpenWorkout] = useState<string | null>(null);

  const workoutsQ = useQuery({
    queryKey: ["workouts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workouts").select("*").order("date", { ascending: false }).limit(30);
      if (error) throw error;
      return data;
    },
  });

  const createWorkout = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("workouts")
        .insert({ user_id: userRes.user.id, date: today(), name: t("workouts.new") })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (w) => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["workouts", "today"] });
      setOpenWorkout(w.id);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("workouts.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("workouts.subtitle")}</p>
        </div>
        <Button onClick={() => createWorkout.mutate()} disabled={createWorkout.isPending}>
          <Plus className="mr-1 h-4 w-4" /> {t("workouts.session")}
        </Button>
      </div>

      <div className="surface-card divide-y divide-border">
        {workoutsQ.data?.length ? workoutsQ.data.map((w) => (
          <button
            key={w.id}
            onClick={() => setOpenWorkout(w.id)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30"
          >
            <div>
              <p className="font-medium">{w.name ?? t("timeline.workout")}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(w.date), "EEE d MMM")}</p>
            </div>
            <ChevronLeft className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
          </button>
        )) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("workouts.empty")}</p>}
      </div>

      <ExerciseLibraryHint />

      {openWorkout && (
        <WorkoutDetailDialog workoutId={openWorkout} onClose={() => setOpenWorkout(null)} />
      )}
    </div>
  );
}

function ExerciseLibraryHint() {
  const q = useQuery({
    queryKey: ["exercises", "count"],
    queryFn: async () => {
      const { count } = await supabase.from("exercises").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });
  return (
    <p className="text-center text-xs text-muted-foreground">
      {t("workouts.library").replace("{n}", String(q.data ?? "…"))}
    </p>
  );
}

function WorkoutDetailDialog({ workoutId, onClose }: { workoutId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const workoutQ = useQuery({
    queryKey: ["workout", workoutId],
    queryFn: async () => {
      const { data, error } = await supabase.from("workouts").select("*").eq("id", workoutId).single();
      if (error) throw error;
      return data;
    },
  });
  const setsQ = useQuery({
    queryKey: ["workout-sets", workoutId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sets")
        .select("*, exercises(name, category)")
        .eq("workout_id", workoutId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
  const exercisesQ = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("*").order("category").order("name");
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const updateWorkout = useMutation({
    mutationFn: async (patch: { name?: string | null; date?: string; duration_min?: number | null; notes?: string | null }) => {
      const { error } = await supabase.from("workouts").update(patch).eq("id", workoutId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workouts"] }),
  });

  const deleteWorkout = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("workouts").delete().eq("id", workoutId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workouts"] });
      onClose();
    },
  });

  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [category, setCategory] = useState<string>("all");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState("");

  const filteredExercises = exercisesQ.data?.filter((e) => category === "all" || e.category === category) ?? [];

  const addSet = useMutation({
    mutationFn: async () => {
      if (!selectedExercise) throw new Error(t("workouts.exercise"));
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not signed in");
      const setNumber = (setsQ.data?.filter((s) => s.exercise_id === selectedExercise).length ?? 0) + 1;
      const { error } = await supabase.from("workout_sets").insert({
        workout_id: workoutId,
        user_id: userRes.user.id,
        exercise_id: selectedExercise,
        set_number: setNumber,
        reps: reps ? Number(reps) : null,
        weight_kg: weight ? Number(weight) : null,
        rpe: rpe ? Number(rpe) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout-sets", workoutId] });
      setReps(""); setWeight(""); setRpe("");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeSet = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workout_sets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workout-sets", workoutId] }),
  });

  const w = workoutQ.data;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("workouts.session")}</DialogTitle>
        </DialogHeader>
        {w && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("workouts.name")}</Label>
              <Input
                defaultValue={w.name ?? ""}
                onBlur={(e) => name !== null && updateWorkout.mutate({ name: e.target.value })}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t("workouts.date")}</Label>
                <Input type="date" defaultValue={w.date} onBlur={(e) => updateWorkout.mutate({ date: e.target.value })} />
              </div>
              <div>
                <Label>{t("workouts.duration")}</Label>
                <Input type="number" defaultValue={w.duration_min ?? ""} onBlur={(e) => updateWorkout.mutate({ duration_min: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </div>
            <div>
              <Label>{t("workouts.notes")}</Label>
              <Textarea
                defaultValue={w.notes ?? ""}
                onBlur={(e) => notes !== null && updateWorkout.mutate({ notes: e.target.value })}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">{t("workouts.addSet")}</h3>
              <div className="grid grid-cols-2 gap-2">
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder={t("workouts.category")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("workouts.categoryAll")}</SelectItem>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`workouts.cat.${c}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={selectedExercise} onValueChange={setSelectedExercise}>
                  <SelectTrigger><SelectValue placeholder={t("workouts.exercise")} /></SelectTrigger>
                  <SelectContent>
                    {filteredExercises.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">{t("workouts.reps")}</Label><Input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} /></div>
                <div><Label className="text-xs">{t("workouts.weightKg")}</Label><Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
                <div><Label className="text-xs">{t("workouts.rpe")}</Label><Input inputMode="decimal" value={rpe} onChange={(e) => setRpe(e.target.value)} /></div>
              </div>
              <Button onClick={() => addSet.mutate()} disabled={addSet.isPending} className="w-full">
                <Plus className="mr-1 h-4 w-4" /> {t("workouts.addSet")}
              </Button>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">{t("workouts.sets")} ({setsQ.data?.length ?? 0})</h3>
              <div className="space-y-1">
                {setsQ.data?.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/40 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{s.exercises?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("workouts.set")} {s.set_number} · {s.reps ?? "—"} {t("workouts.reps")} · {s.weight_kg ?? "—"} ק״ג{s.rpe ? ` · RPE ${s.rpe}` : ""}
                      </p>
                    </div>
                    <button onClick={() => removeSet.mutate(s.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            <Button variant="destructive" onClick={() => deleteWorkout.mutate()} className="w-full">
              {t("workouts.delete")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
