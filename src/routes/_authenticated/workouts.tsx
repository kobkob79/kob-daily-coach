/**
 * /workouts — Weekly Plan.
 *
 * Sprint 1 rebuild: minimal weekly grid where each day holds an optional
 * workout template. Tap a day to assign a template or start the workout.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Play, ClipboardList, History, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import {
  createSessionFromTemplate,
  getWeeklyPlan,
  setPlanSlot,
  WEEKDAY_HE,
  type PlanSlot,
} from "@/lib/workout-session";

export const Route = createFileRoute("/_authenticated/workouts")({
  component: WeeklyPlanPage,
});

type Template = { id: string; name: string };

function WeeklyPlanPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<number | null>(null);

  const planQ = useQuery({ queryKey: ["weekly-plan"], queryFn: getWeeklyPlan });
  const templatesQ = useQuery({
    queryKey: ["workout_templates_min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("id,name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const today = new Date().getDay();
  const bySlot = useMemo(() => {
    const map = new Map<number, PlanSlot>();
    for (const s of planQ.data ?? []) map.set(s.weekday, s);
    return map;
  }, [planQ.data]);

  const start = useMutation({
    mutationFn: async (slot: PlanSlot) => {
      if (!slot.template_id) throw new Error("אין תבנית ליום זה");
      const tpl = templatesQ.data?.find((x) => x.id === slot.template_id);
      return createSessionFromTemplate(slot.template_id, slot.display_name ?? tpl?.name ?? "אימון");
    },
    onSuccess: (sessionId) => {
      navigate({
        to: "/workouts/session/$sessionId/brief",
        params: { sessionId },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("workouts.title")}</h1>
          <p className="text-sm text-muted-foreground">התוכנית השבועית שלך</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/workouts/history">
              <History className="mr-1 h-4 w-4" /> היסטוריה
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/workout-templates">
              <ClipboardList className="mr-1 h-4 w-4" /> {t("workouts.templates")}
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-2">
        {WEEKDAY_HE.map((label, idx) => {
          const slot = bySlot.get(idx);
          const tpl = slot?.template_id
            ? templatesQ.data?.find((x) => x.id === slot.template_id)
            : null;
          const isToday = idx === today;
          return (
            <div
              key={idx}
              className={`surface-card flex items-center justify-between gap-3 rounded-2xl p-4 ${
                isToday ? "ring-1 ring-primary/40" : ""
              }`}
            >
              <button
                onClick={() => setEditing(idx)}
                className="flex-1 text-right"
              >
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  יום {label}
                  {isToday ? " · היום" : ""}
                </p>
                <p className="text-lg font-semibold">
                  {tpl?.name ?? slot?.display_name ?? "יום חופש"}
                </p>
              </button>
              {slot?.template_id ? (
                <Button
                  size="sm"
                  onClick={() => start.mutate(slot)}
                  disabled={start.isPending}
                >
                  <Play className="mr-1 h-4 w-4" /> התחל
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(idx)}
                >
                  שיוך תבנית
                  <ChevronLeft className="mr-1 h-4 w-4 rtl:rotate-180" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {editing !== null && (
        <AssignDialog
          weekday={editing}
          current={bySlot.get(editing) ?? null}
          templates={templatesQ.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["weekly-plan"] });
          }}
        />
      )}
    </div>
  );
}

function AssignDialog({
  weekday,
  current,
  templates,
  onClose,
  onSaved,
}: {
  weekday: number;
  current: PlanSlot | null;
  templates: Template[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [templateId, setTemplateId] = useState<string>(current?.template_id ?? "");

  const save = useMutation({
    mutationFn: async () =>
      setPlanSlot(weekday, templateId || null, null),
    onSuccess: onSaved,
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: async () => setPlanSlot(weekday, null, null),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>יום {WEEKDAY_HE[weekday]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder="בחר תבנית" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {templates.length === 0 && (
            <p className="text-xs text-muted-foreground">
              אין תבניות עדיין —{" "}
              <Link to="/workout-templates" className="text-primary underline">
                צור תבנית
              </Link>
              .
            </p>
          )}
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              שמור
            </Button>
            <Button
              variant="ghost"
              onClick={() => clear.mutate()}
              disabled={clear.isPending}
            >
              נקה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
