import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, ChevronLeft, Camera, Upload, Pencil, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { today } from "@/lib/date";
import { t } from "@/lib/i18n";
import { MUSCLE_GROUPS, normalizeMuscleGroup, type MuscleGroup } from "@/lib/muscle-groups";

export const Route = createFileRoute("/_authenticated/workouts")({
  component: WorkoutsPage,
});

const EXERCISE_IMAGES_BUCKET = "exercise-images";

/* ----------------------------- Types ----------------------------- */

type ExerciseRow = {
  id: string;
  name: string;
  muscle_group: string | null;
  image_path: string | null;
  category: string;
  owner_id: string | null;
};

/* --------------------------- Main page --------------------------- */

function WorkoutsPage() {
  const qc = useQueryClient();
  const [openWorkout, setOpenWorkout] = useState<string | null>(null);

  const workoutsQ = useQuery({
    queryKey: ["workouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workouts").select("*").order("date", { ascending: false }).limit(30);
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
        .select().single();
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
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/workout-templates">{t("workouts.templates")}</a>
          </Button>
          <Button asChild size="sm">
            <a href="/workout-templates?start=1">
              <Plus className="mr-1 h-4 w-4" /> {t("workouts.start")}
            </a>
          </Button>
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => createWorkout.mutate()} disabled={createWorkout.isPending}>
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

/* -------------------- Signed URL hook -------------------- */

function useExerciseImageUrl(path: string | null | undefined) {
  const q = useQuery({
    queryKey: ["exercise-image", path],
    enabled: !!path,
    staleTime: 55 * 60 * 1000,
    queryFn: async () => {
      if (!path) return null;
      const { data } = await supabase.storage
        .from(EXERCISE_IMAGES_BUCKET).createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
  return q.data ?? null;
}

/* -------------------- Workout detail dialog -------------------- */

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
        .select("*, exercises(name, muscle_group, image_path)")
        .eq("workout_id", workoutId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
  const exercisesQ = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id,name,muscle_group,image_path,category,owner_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ExerciseRow[];
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

  // Muscle-group → exercise → sets flow
  const [muscle, setMuscle] = useState<MuscleGroup | "all">("all");
  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState("");
  const [showLibrary, setShowLibrary] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseRow | null>(null);
  const [creatingInGroup, setCreatingInGroup] = useState<MuscleGroup | null>(null);

  const filteredExercises = useMemo(() => {
    const list = exercisesQ.data ?? [];
    if (muscle === "all") return list;
    return list.filter((e) => normalizeMuscleGroup(e.muscle_group) === muscle);
  }, [exercisesQ.data, muscle]);

  const activeExercise = filteredExercises.find((e) => e.id === selectedExercise) ?? null;

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

            {/* Add set: pick muscle group → exercise → sets */}
            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                {t("workouts.addSet")}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={muscle}
                  onValueChange={(v) => {
                    setMuscle(v as MuscleGroup | "all");
                    setSelectedExercise("");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={t("workouts.pickMuscle")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("workouts.categoryAll")}</SelectItem>
                    {MUSCLE_GROUPS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={selectedExercise} onValueChange={setSelectedExercise}>
                  <SelectTrigger><SelectValue placeholder={t("workouts.pickExercise")} /></SelectTrigger>
                  <SelectContent>
                    {filteredExercises.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground">
                        {t("workouts.noExercisesInGroup")}
                      </div>
                    ) : filteredExercises.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Selected exercise preview with permanent image */}
              {activeExercise && (
                <ExercisePreview
                  exercise={activeExercise}
                  onEdit={() => setEditingExercise(activeExercise)}
                />
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() =>
                    setCreatingInGroup(muscle === "all" ? "אחר" : (muscle as MuscleGroup))
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> {t("workouts.newExercise")}
                </Button>
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => setShowLibrary(true)}
                >
                  <ImageIcon className="mr-1 h-3.5 w-3.5" /> ספריית תרגילים
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div><Label className="text-xs">{t("workouts.reps")}</Label><Input inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} /></div>
                <div><Label className="text-xs">{t("workouts.weightKg")}</Label><Input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
                <div><Label className="text-xs">{t("workouts.rpe")}</Label><Input inputMode="decimal" value={rpe} onChange={(e) => setRpe(e.target.value)} /></div>
              </div>
              <Button onClick={() => addSet.mutate()} disabled={addSet.isPending || !selectedExercise} className="w-full">
                <Plus className="mr-1 h-4 w-4" /> {t("workouts.addSet")}
              </Button>
            </div>

            {/* Sets list */}
            <div className="space-y-2">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                {t("workouts.sets")} ({setsQ.data?.length ?? 0})
              </h3>
              <div className="space-y-1">
                {setsQ.data?.map((s) => (
                  <SetRow
                    key={s.id}
                    exerciseName={s.exercises?.name ?? "—"}
                    imagePath={
                      (s.exercises as { image_path?: string | null } | null)?.image_path ?? null
                    }
                    setNumber={s.set_number}
                    reps={s.reps}
                    weightKg={s.weight_kg}
                    rpe={s.rpe}
                    onRemove={() => removeSet.mutate(s.id)}
                  />
                ))}
              </div>
            </div>

            <Button variant="destructive" onClick={() => deleteWorkout.mutate()} className="w-full">
              {t("workouts.delete")}
            </Button>
          </div>
        )}

        {(editingExercise || creatingInGroup) && (
          <ExerciseEditorDialog
            exercise={editingExercise}
            defaultMuscle={creatingInGroup ?? "אחר"}
            onClose={() => { setEditingExercise(null); setCreatingInGroup(null); }}
            onSaved={(id) => {
              qc.invalidateQueries({ queryKey: ["exercises"] });
              qc.invalidateQueries({ queryKey: ["exercises", "count"] });
              if (id) setSelectedExercise(id);
            }}
          />
        )}

        {showLibrary && (
          <ExerciseLibraryDialog
            onClose={() => setShowLibrary(false)}
            onPick={(id) => { setSelectedExercise(id); setShowLibrary(false); }}
            onEdit={(ex) => setEditingExercise(ex)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Sub components -------------------- */

function ExercisePreview({
  exercise, onEdit,
}: { exercise: ExerciseRow; onEdit: () => void }) {
  const url = useExerciseImageUrl(exercise.image_path);
  const group = normalizeMuscleGroup(exercise.muscle_group);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/20 p-2.5">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" aria-label={t("workouts.image.view")}>
          <img src={url} alt="" className="h-16 w-16 rounded-xl object-cover" />
        </a>
      ) : (
        <span className="grid h-16 w-16 place-items-center rounded-xl bg-muted/60 text-muted-foreground">
          <ImageIcon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{exercise.name}</p>
        <p className="text-[11px] text-muted-foreground">{group}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 rounded-full border border-border/60 px-2.5 py-1 text-[11px]"
      >
        <Pencil className="mr-1 inline h-3 w-3" /> {t("workouts.editExercise")}
      </button>
    </div>
  );
}

function SetRow({
  exerciseName, imagePath, setNumber, reps, weightKg, rpe, onRemove,
}: {
  exerciseName: string;
  imagePath: string | null;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  rpe: number | null;
  onRemove: () => void;
}) {
  const url = useExerciseImageUrl(imagePath);
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-secondary/40 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        {url ? (
          <img src={url} alt="" className="h-10 w-10 rounded-lg object-cover" />
        ) : (
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-muted/50 text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <p className="font-medium truncate">{exerciseName}</p>
          <p className="text-xs text-muted-foreground">
            {t("workouts.set")} {setNumber} · {reps ?? "—"} {t("workouts.reps")} · {weightKg ?? "—"} ק״ג{rpe ? ` · RPE ${rpe}` : ""}
          </p>
        </div>
      </div>
      <button onClick={onRemove} className="shrink-0 text-muted-foreground hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/* -------------------- Exercise editor -------------------- */

function ExerciseEditorDialog({
  exercise, defaultMuscle, onClose, onSaved,
}: {
  exercise: ExerciseRow | null;
  defaultMuscle: MuscleGroup;
  onClose: () => void;
  onSaved: (id: string | null) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(exercise?.name ?? "");
  const [group, setGroup] = useState<MuscleGroup>(
    exercise ? normalizeMuscleGroup(exercise.muscle_group) : defaultMuscle,
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const savedUrl = useExerciseImageUrl(exercise?.image_path);

  const pickFile = (f: File | null) => {
    if (!f) return;
    setPendingFile(f);
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(URL.createObjectURL(f));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t("workouts.exerciseName"));
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not signed in");

      let image_path = exercise?.image_path ?? null;
      if (pendingFile) {
        const ext = (pendingFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${userRes.user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(EXERCISE_IMAGES_BUCKET)
          .upload(path, pendingFile, { upsert: false, contentType: pendingFile.type || "image/jpeg" });
        if (upErr) throw upErr;
        // Remove old image if replacing
        if (exercise?.image_path) {
          await supabase.storage.from(EXERCISE_IMAGES_BUCKET).remove([exercise.image_path]);
        }
        image_path = path;
      }

      if (exercise) {
        const { error } = await supabase
          .from("exercises")
          .update({ name: name.trim(), muscle_group: group, image_path })
          .eq("id", exercise.id);
        if (error) throw error;
        return exercise.id;
      } else {
        const { data, error } = await supabase
          .from("exercises")
          .insert({
            name: name.trim(),
            muscle_group: group,
            image_path,
            owner_id: userRes.user.id,
            category: "core", // legacy enum column — pick a safe default
          })
          .select("id").single();
        if (error) throw error;
        return data.id as string;
      }
    },
    onSuccess: (id) => {
      toast.success(t("workouts.exerciseSaved"));
      onSaved(id);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeImage = useMutation({
    mutationFn: async () => {
      if (!exercise?.image_path) return;
      await supabase.storage.from(EXERCISE_IMAGES_BUCKET).remove([exercise.image_path]);
      const { error } = await supabase
        .from("exercises").update({ image_path: null }).eq("id", exercise.id);
      if (error) throw error;
    },
    onSuccess: () => { onSaved(exercise?.id ?? null); },
    onError: (e) => toast.error(e.message),
  });

  const displayUrl = localPreview ?? savedUrl;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {exercise ? t("workouts.editExercise") : t("workouts.newExercise")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("workouts.exerciseName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>{t("workouts.category")}</Label>
            <Select value={group} onValueChange={(v) => setGroup(v as MuscleGroup)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MUSCLE_GROUPS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("workouts.exerciseImage")}</Label>
            <p className="text-[11px] text-muted-foreground">{t("workouts.exerciseImageHint")}</p>
            {displayUrl ? (
              <div className="relative overflow-hidden rounded-2xl border border-border/60">
                <img src={displayUrl} alt="" className="max-h-56 w-full object-cover" />
              </div>
            ) : (
              <div className="grid h-32 place-items-center rounded-2xl border border-dashed border-border/70 bg-muted/30 text-muted-foreground">
                <ImageIcon className="h-6 w-6" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-muted/30 py-2 text-xs font-medium hover:border-primary/50"
              >
                <Camera className="h-4 w-4" /> {t("workouts.image.take")}
              </button>
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-muted/30 py-2 text-xs font-medium hover:border-primary/50"
              >
                <Upload className="h-4 w-4" /> {t("workouts.image.upload")}
              </button>
            </div>
            {exercise?.image_path && !pendingFile && (
              <button
                type="button"
                onClick={() => removeImage.mutate()}
                className="text-xs text-destructive hover:underline"
              >
                {t("workouts.image.remove")}
              </button>
            )}
            <input
              ref={cameraRef} type="file" accept="image/*" capture="environment"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <input
              ref={uploadRef} type="file" accept="image/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">
            {save.isPending ? "..." : t("workouts.exerciseSaved")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Library dialog -------------------- */

function ExerciseLibraryDialog({
  onClose, onPick, onEdit,
}: {
  onClose: () => void;
  onPick: (id: string) => void;
  onEdit: (ex: ExerciseRow) => void;
}) {
  const q = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id,name,muscle_group,image_path,category,owner_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ExerciseRow[];
    },
  });

  const grouped = useMemo(() => {
    const m = new Map<MuscleGroup, ExerciseRow[]>();
    for (const e of q.data ?? []) {
      const g = normalizeMuscleGroup(e.muscle_group);
      const arr = m.get(g) ?? [];
      arr.push(e);
      m.set(g, arr);
    }
    return m;
  }, [q.data]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ספריית תרגילים</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {MUSCLE_GROUPS.filter((g) => grouped.has(g)).map((g) => (
            <div key={g}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g}</p>
              <div className="grid grid-cols-2 gap-2">
                {grouped.get(g)!.map((e) => (
                  <LibraryCard
                    key={e.id}
                    exercise={e}
                    onPick={() => onPick(e.id)}
                    onEdit={() => onEdit(e)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LibraryCard({
  exercise, onPick, onEdit,
}: { exercise: ExerciseRow; onPick: () => void; onEdit: () => void }) {
  const url = useExerciseImageUrl(exercise.image_path);
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60">
      <button type="button" onClick={onPick} className="block w-full text-left">
        {url ? (
          <img src={url} alt="" className="h-24 w-full object-cover" />
        ) : (
          <div className="grid h-24 place-items-center bg-muted/40 text-muted-foreground">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
        <div className="p-2">
          <p className="truncate text-sm font-medium">{exercise.name}</p>
        </div>
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="w-full border-t border-border/60 py-1 text-[11px] text-muted-foreground hover:text-foreground"
      >
        <Pencil className="mr-1 inline h-3 w-3" /> {t("workouts.editExercise")}
      </button>
    </div>
  );
}
