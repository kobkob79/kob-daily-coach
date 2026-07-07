/**
 * Workout Session — one exercise, one set at a time.
 * Loads exercises from a template, guides through target sets, then advances
 * to the next exercise. Designed for in-gym one-hand use — big inputs, big
 * save button, minimal scrolling.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { t } from "@/lib/i18n";

const searchSchema = z.object({
  template: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/workout-session/$workoutId")({
  validateSearch: zodValidator(searchSchema),
  component: SessionPage,
});

type Row = {
  id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  exercises: { id: string; name: string; muscle_group: string | null } | null;
};

function SessionPage() {
  const { workoutId } = Route.useParams();
  const { template } = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const rowsQ = useQuery({
    enabled: !!template,
    queryKey: ["session_template", template],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .select("id,exercise_id,position,target_sets,target_reps,target_weight_kg,exercises(id,name,muscle_group)")
        .eq("template_id", template)
        .order("position");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const setsQ = useQuery({
    queryKey: ["session_sets", workoutId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sets")
        .select("id,exercise_id,set_number,weight_kg,reps,rpe")
        .eq("workout_id", workoutId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = rowsQ.data ?? [];
  // Progression: first exercise where completed sets < target_sets
  const progress = useMemo(() => {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const done = (setsQ.data ?? []).filter((s) => s.exercise_id === r.exercise_id).length;
      if (done < r.target_sets) return { exIndex: i, setNumber: done + 1 };
    }
    return { exIndex: rows.length, setNumber: 0 };
  }, [rows, setsQ.data]);

  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const exIndex = manualIndex ?? progress.exIndex;
  const current = rows[exIndex];
  const currentDoneSets = current
    ? (setsQ.data ?? []).filter((s) => s.exercise_id === current.exercise_id).length
    : 0;
  const currentSetNumber = current ? Math.min(currentDoneSets + 1, current.target_sets) : 0;

  const [weight, setWeight] = useState<string>("");
  const [reps, setReps] = useState<string>("");
  const [rpe, setRpe] = useState<string>("");

  // Auto-fill from previous set or template target
  useMemo(() => {
    if (!current) return;
    const prev = [...(setsQ.data ?? [])]
      .filter((s) => s.exercise_id === current.exercise_id)
      .sort((a, b) => b.set_number - a.set_number)[0];
    setWeight(String(prev?.weight_kg ?? current.target_weight_kg ?? ""));
    setReps(String(prev?.reps ?? current.target_reps ?? ""));
    setRpe(prev?.rpe != null ? String(prev.rpe) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, currentDoneSets]);

  const saveSet = useMutation({
    mutationFn: async () => {
      if (!current) return;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { error } = await supabase.from("workout_sets").insert({
        user_id: u.user.id,
        workout_id: workoutId,
        exercise_id: current.exercise_id,
        set_number: currentSetNumber,
        weight_kg: weight === "" ? null : Number(weight),
        reps: reps === "" ? null : Number(reps),
        rpe: rpe === "" ? null : Number(rpe),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setManualIndex(null);
      qc.invalidateQueries({ queryKey: ["session_sets", workoutId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const finish = () => {
    toast.success(t("session.done"));
    navigate({ to: "/workouts" });
  };

  if (!template) {
    return (
      <div className="p-6 text-center text-sm">
        <p>{t("session.noTemplate")}</p>
        <Button asChild className="mt-3">
          <Link to="/workout-templates">{t("templates.title")}</Link>
        </Button>
      </div>
    );
  }

  if (rowsQ.isLoading) return <p className="p-6 text-center text-sm">…</p>;

  if (!rows.length) {
    return (
      <div className="p-6 text-center text-sm">
        <p>{t("session.noTemplate")}</p>
      </div>
    );
  }

  const done = exIndex >= rows.length;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-md flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/workouts">
            <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" />
            סיים
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("session.exerciseOf").replace("{n}", String(Math.min(exIndex + 1, rows.length))).replace("{total}", String(rows.length))}
        </p>
      </div>

      {done ? (
        <div className="surface-card grid place-items-center gap-3 p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <p className="text-lg font-semibold">{t("session.done")}</p>
          <Button size="lg" onClick={finish}>
            <Flag className="mr-1 h-4 w-4" /> {t("session.finish")}
          </Button>
        </div>
      ) : (
        <>
          {/* Big current-exercise card */}
          <div className="surface-card space-y-3 p-5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {current!.exercises?.muscle_group ?? ""}
            </p>
            <h2 className="text-3xl font-extrabold leading-tight">
              {current!.exercises?.name ?? "—"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("session.set")
                .replace("{n}", String(currentSetNumber))
                .replace("{total}", String(current!.target_sets))}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">{t("workouts.weightKg")}</Label>
                <Input
                  inputMode="decimal"
                  className="h-14 text-2xl font-semibold text-center"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">{t("workouts.reps")}</Label>
                <Input
                  inputMode="numeric"
                  className="h-14 text-2xl font-semibold text-center"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">{t("workouts.rpe")} (1-10)</Label>
              <Input
                inputMode="numeric"
                className="h-12 text-center"
                value={rpe}
                onChange={(e) => setRpe(e.target.value)}
              />
            </div>

            <Button
              size="lg"
              className="h-14 w-full text-lg"
              onClick={() => saveSet.mutate()}
              disabled={saveSet.isPending}
            >
              {t("session.save")}
            </Button>
          </div>

          {/* Nav + previews */}
          <div className="flex items-center justify-between text-xs">
            <Button
              variant="ghost"
              size="sm"
              disabled={exIndex === 0}
              onClick={() => setManualIndex(Math.max(0, exIndex - 1))}
            >
              <ChevronRight className="ml-1 h-4 w-4 rtl:rotate-180" />
              {t("session.previous")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={exIndex >= rows.length - 1}
              onClick={() => setManualIndex(Math.min(rows.length - 1, exIndex + 1))}
            >
              {t("session.next")}
              <ChevronLeft className="mr-1 h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>

          {rows[exIndex + 1] && (
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
              <p className="text-[11px] text-muted-foreground">{t("session.upNext")}</p>
              <p className="text-sm font-medium">{rows[exIndex + 1].exercises?.name}</p>
            </div>
          )}

          {/* Completed list */}
          {rows.slice(0, exIndex).length > 0 && (
            <div className="rounded-2xl border border-border/60 p-3 space-y-1">
              <p className="text-[11px] text-muted-foreground">{t("session.completed")}</p>
              {rows.slice(0, exIndex).map((r) => (
                <p key={r.id} className="text-xs text-muted-foreground">
                  ✓ {r.exercises?.name}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
