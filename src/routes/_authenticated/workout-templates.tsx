/**
 * Workout Templates — reusable routines (Full Body A/B, Push, Pull, Legs...).
 * Users create, edit, duplicate, delete templates and reorder exercises.
 * "Start Workout": starts or resumes the session-based workout flow.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Copy, Play, ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { today } from "@/lib/date";
import { t } from "@/lib/i18n";
import { ActiveSessionConflictError, startOrResumeSessionForTemplate } from "@/lib/workout-session";

const searchSchema = z.object({
  start: fallback(z.number().int(), 0).default(0),
});

export const Route = createFileRoute("/_authenticated/workout-templates")({
  validateSearch: zodValidator(searchSchema),
  component: TemplatesPage,
});

type Template = { id: string; name: string; notes: string | null };
type TExercise = {
  id: string;
  template_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: number | null;
  target_weight_kg: number | null;
  exercises: { id: string; name: string; muscle_group: string | null } | null;
};
type ExerciseRow = { id: string; name: string; muscle_group: string | null };

function TemplatesPage() {
  const qc = useQueryClient();
  const { start } = Route.useSearch();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState<boolean>(start === 1);

  const templatesQ = useQuery({
    queryKey: ["workout_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("id,name,notes")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Template[];
    },
  });

  const createTpl = useMutation({
    mutationFn: async (name: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("workout_templates")
        .insert({ user_id: u.user.id, name })
        .select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["workout_templates"] });
      setOpenId(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data: src, error: e1 } = await supabase
        .from("workout_templates").select("name,notes").eq("id", id).single();
      if (e1) throw e1;
      const { data: dst, error: e2 } = await supabase
        .from("workout_templates")
        .insert({ user_id: u.user.id, name: `${src.name} (עותק)`, notes: src.notes })
        .select("id").single();
      if (e2) throw e2;
      const { data: rows, error: e3 } = await supabase
        .from("workout_template_exercises")
        .select("exercise_id,position,target_sets,target_reps,target_weight_kg")
        .eq("template_id", id);
      if (e3) throw e3;
      if (rows?.length) {
        const { error: e4 } = await supabase.from("workout_template_exercises").insert(
          rows.map((r) => ({ ...r, template_id: dst.id, user_id: u.user!.id })),
        );
        if (e4) throw e4;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workout_templates"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workout_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workout_templates"] }),
  });

  const [newName, setNewName] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{t("templates.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("templates.subtitle")}</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/workouts">→</Link>
        </Button>
      </div>

      <div className="surface-card p-3">
        <div className="flex gap-2">
          <Input
            placeholder={t("templates.namePh")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button
            onClick={() => {
              if (!newName.trim()) return;
              createTpl.mutate(newName.trim());
              setNewName("");
            }}
            disabled={createTpl.isPending}
          >
            <Plus className="mr-1 h-4 w-4" /> {t("templates.new")}
          </Button>
        </div>
      </div>

      <div className="surface-card divide-y divide-border">
        {templatesQ.data?.length ? templatesQ.data.map((tpl) => (
          <div key={tpl.id} className="flex items-center gap-2 px-3 py-2.5">
            <button
              className="flex-1 text-right"
              onClick={() => setOpenId(tpl.id)}
            >
              <p className="font-medium">{tpl.name}</p>
              {tpl.notes && <p className="text-xs text-muted-foreground">{tpl.notes}</p>}
            </button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => duplicate.mutate(tpl.id)}
              title={t("templates.duplicate")}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm(t("templates.deleteConfirm"))) remove.mutate(tpl.id);
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
            <StartButton templateId={tpl.id} navigate={navigate} />
          </div>
        )) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t("templates.empty")}
          </p>
        )}
      </div>

      {openId && (
        <TemplateEditor templateId={openId} onClose={() => setOpenId(null)} />
      )}

      {pickerOpen && (
        <Dialog open onOpenChange={() => setPickerOpen(false)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("templates.pick")}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-1 overflow-auto">
              {templatesQ.data?.map((tpl) => (
                <div key={tpl.id} className="flex items-center gap-2">
                  <div className="flex-1 truncate">{tpl.name}</div>
                  <StartButton templateId={tpl.id} navigate={navigate} />
                </div>
              ))}
              {!templatesQ.data?.length && (
                <p className="text-center text-sm text-muted-foreground">
                  {t("templates.empty")}
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function StartButton({
  templateId,
  navigate,
}: {
  templateId: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const startMut = useMutation({
    mutationFn: async () => {
      const { data: tpl } = await supabase
        .from("workout_templates").select("name").eq("id", templateId).single();
      const { count } = await supabase
        .from("workout_template_exercises")
        .select("*", { count: "exact", head: true })
        .eq("template_id", templateId);
      if (!count) throw new Error(t("session.noTemplate"));
      return startOrResumeSessionForTemplate(templateId, tpl?.name ?? "אימון");
    },
    onSuccess: ({ sessionId }) => {
      navigate({
        to: "/workouts/session/$sessionId",
        params: { sessionId },
      });
    },
    onError: (e: Error) => {
      console.error("[workout-templates] start failed", e);
      toast.error(e instanceof ActiveSessionConflictError ? "יש לך אימון פעיל" : "לא הצלחנו להתחיל את האימון");
    },
  });
  return (
    <Button size="sm" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
      <Play className="mr-1 h-4 w-4" /> {t("templates.start")}
    </Button>
  );
}

/* -------------------- Editor -------------------- */

function TemplateEditor({ templateId, onClose }: { templateId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const tplQ = useQuery({
    queryKey: ["workout_template", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates").select("id,name,notes").eq("id", templateId).single();
      if (error) throw error;
      return data as Template;
    },
  });
  const rowsQ = useQuery({
    queryKey: ["workout_template_exercises", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_template_exercises")
        .select("id,template_id,exercise_id,position,target_sets,target_reps,target_weight_kg,exercises(id,name,muscle_group)")
        .eq("template_id", templateId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TExercise[];
    },
  });
  const exercisesQ = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises").select("id,name,muscle_group").order("name");
      if (error) throw error;
      return (data ?? []) as ExerciseRow[];
    },
  });

  const [name, setName] = useState<string>("");
  useMemo(() => {
    if (tplQ.data) setName(tplQ.data.name);
  }, [tplQ.data]);

  const saveName = useMutation({
    mutationFn: async (n: string) => {
      const { error } = await supabase
        .from("workout_templates").update({ name: n }).eq("id", templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workout_templates"] });
      toast.success(t("templates.saved"));
    },
  });

  const addExercise = useMutation({
    mutationFn: async (exerciseId: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const nextPos = (rowsQ.data?.length ?? 0);
      const { error } = await supabase.from("workout_template_exercises").insert({
        user_id: u.user.id,
        template_id: templateId,
        exercise_id: exerciseId,
        position: nextPos,
        target_sets: 3,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workout_template_exercises", templateId] }),
  });

  const patchRow = useMutation({
    mutationFn: async (patch: { id: string } & Record<string, unknown>) => {
      const { id, exercises: _e, ...rest } = patch as { id: string; exercises?: unknown } & Record<string, unknown>;
      void _e;
      const { error } = await supabase
        .from("workout_template_exercises")
        .update(rest as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workout_template_exercises", templateId] }),
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workout_template_exercises").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workout_template_exercises", templateId] }),
  });

  const swap = useMutation({
    mutationFn: async ({ a, b }: { a: TExercise; b: TExercise }) => {
      // swap positions
      const { error: e1 } = await supabase
        .from("workout_template_exercises").update({ position: b.position }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("workout_template_exercises").update({ position: a.position }).eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workout_template_exercises", templateId] }),
  });

  const [pickId, setPickId] = useState<string>("");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tplQ.data?.name ?? "…"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>{t("templates.name")}</Label>
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
              <Button size="sm" onClick={() => saveName.mutate(name)} disabled={!name.trim()}>
                {t("workouts.saved")}
              </Button>
            </div>
          </div>

          <div>
            <Label>{t("templates.exercises")}</Label>
            <div className="mt-2 space-y-2">
              {rowsQ.data?.map((r, idx) => (
                <div key={r.id} className="rounded-xl border border-border p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        className="p-1 text-muted-foreground disabled:opacity-30"
                        disabled={idx === 0}
                        onClick={() => {
                          const prev = rowsQ.data![idx - 1];
                          swap.mutate({ a: r, b: prev });
                        }}
                        aria-label={t("templates.moveUp")}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        className="p-1 text-muted-foreground disabled:opacity-30"
                        disabled={idx === (rowsQ.data!.length - 1)}
                        onClick={() => {
                          const next = rowsQ.data![idx + 1];
                          swap.mutate({ a: r, b: next });
                        }}
                        aria-label={t("templates.moveDown")}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{r.exercises?.name ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.exercises?.muscle_group ?? ""}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeRow.mutate(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <Label className="text-[10px]">{t("templates.targetSets")}</Label>
                      <Input
                        type="number" min={1} value={r.target_sets ?? 3}
                        onChange={(e) =>
                          patchRow.mutate({ id: r.id, target_sets: Number(e.target.value) || 1 })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">{t("templates.targetReps")}</Label>
                      <Input
                        type="number" min={0} value={r.target_reps ?? ""}
                        onChange={(e) =>
                          patchRow.mutate({
                            id: r.id,
                            target_reps: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label className="text-[10px]">{t("templates.targetWeight")}</Label>
                      <Input
                        type="number" step="0.5" min={0} value={r.target_weight_kg ?? ""}
                        onChange={(e) =>
                          patchRow.mutate({
                            id: r.id,
                            target_weight_kg: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              <Select value={pickId} onValueChange={setPickId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={t("workouts.pickExercise")} />
                </SelectTrigger>
                <SelectContent>
                  {exercisesQ.data?.map((ex) => (
                    <SelectItem key={ex.id} value={ex.id}>
                      {ex.name}{ex.muscle_group ? ` · ${ex.muscle_group}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => {
                  if (!pickId) return;
                  addExercise.mutate(pickId);
                  setPickId("");
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                {t("templates.addExercise")}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <ChevronRight className="mr-1 h-4 w-4 rtl:rotate-180" />
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
