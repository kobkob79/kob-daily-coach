/**
 * /workouts — Workout Home.
 *
 * Sprint 2 redesign: premium program-progress card at the top, followed by
 * a timeline of planned workouts for the week. Neon-lime accent for the
 * next workout, green check for completed ones. Cards remain assignable
 * via a lightweight sheet.
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
import {
  Play,
  ClipboardList,
  History,
  Check,
  ChevronLeft,
  Dumbbell,
  ChartLine,
} from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import {
  createSessionFromTemplate,
  getWeeklyPlan,
  listSessions,
  setPlanSlot,
  WEEKDAY_HE,
  type PlanSlot,
} from "@/lib/workout-session";

export const Route = createFileRoute("/_authenticated/workouts")({
  component: WorkoutHome,
});

type Template = { id: string; name: string };

function startOfWeek(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function WorkoutHome() {
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
  const sessionsQ = useQuery({
    queryKey: ["sessions", "recent"],
    queryFn: () => listSessions(30),
  });
  const exImagesQ = useQuery({
    queryKey: ["template_hero_images"],
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_template_exercises")
        .select("template_id, position, exercises(image_path)");
      const map = new Map<string, string>();
      for (const row of (data ?? []) as unknown as {
        template_id: string;
        position: number;
        exercises: { image_path: string | null } | null;
      }[]) {
        if (!map.has(row.template_id) && row.exercises?.image_path) {
          map.set(row.template_id, row.exercises.image_path);
        }
      }
      return map;
    },
  });

  const today = new Date().getDay();
  const bySlot = useMemo(() => {
    const map = new Map<number, PlanSlot>();
    for (const s of planQ.data ?? []) map.set(s.weekday, s);
    return map;
  }, [planQ.data]);

  // Progress: completed sessions this week / planned slots
  const weekStart = startOfWeek();
  const completedThisWeek = (sessionsQ.data ?? []).filter(
    (s) =>
      s.status === "completed" &&
      s.finished_at &&
      new Date(s.finished_at) >= weekStart,
  );
  const planned = (planQ.data ?? []).filter((p) => p.template_id);
  const doneIds = new Set(
    completedThisWeek.map((s) => s.template_id).filter(Boolean) as string[],
  );
  const doneCount = Math.min(doneIds.size, planned.length);
  const progress =
    planned.length > 0 ? Math.round((doneCount / planned.length) * 100) : 0;

  const nextWeekday = useMemo(() => {
    for (let i = 0; i < 7; i++) {
      const d = (today + i) % 7;
      const slot = bySlot.get(d);
      if (slot?.template_id && !doneIds.has(slot.template_id)) return d;
    }
    return null;
  }, [today, bySlot, doneIds]);

  const start = useMutation({
    mutationFn: async (slot: PlanSlot) => {
      if (!slot.template_id) throw new Error("אין תבנית ליום זה");
      const tpl = templatesQ.data?.find((x) => x.id === slot.template_id);
      return createSessionFromTemplate(
        slot.template_id,
        slot.display_name ?? tpl?.name ?? "אימון",
      );
    },
    onSuccess: (sessionId) => {
      navigate({
        to: "/workouts/session/$sessionId/brief",
        params: { sessionId },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const programName = planned.length ? "Full Body" : "ללא תוכנית";
  const heroImage = planned[0]?.template_id
    ? exImagesQ.data?.get(planned[0].template_id!)
    : null;

  return (
    <div dir="rtl" className="space-y-5 pb-4">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">{t("workouts.title")}</h1>
          <p className="text-sm text-muted-foreground">התוכנית שלך לשבוע</p>
        </div>
        <div className="flex gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="היסטוריה">
            <Link to="/workouts/history">
              <History className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" aria-label={t("workouts.templates")}>
            <Link to="/workout-templates">
              <ClipboardList className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Program progress card */}
      <Link
        to="/workouts/program"
        className="relative block overflow-hidden rounded-3xl border border-primary/30 p-5 hero-glow"
      >
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="oklch(1 0 0 / 8%)"
                strokeWidth="8"
                fill="none"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="oklch(0.93 0.24 125)"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(progress / 100) * 264} 264`}
                strokeLinecap="round"
                style={{ filter: "drop-shadow(0 0 8px oklch(0.93 0.24 125 / 60%))" }}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <span className="text-lg font-extrabold tabular-nums">{progress}%</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-primary">
              תוכנית פעילה
            </p>
            <p className="truncate text-lg font-extrabold">תוכנית {programName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {doneCount} מתוך {planned.length} אימונים השבוע
            </p>
          </div>
          <ChartLine className="h-4 w-4 text-muted-foreground" />
        </div>
      </Link>

      {/* Weekly timeline */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-extrabold">אימוני השבוע</h2>
          <span className="text-xs text-muted-foreground">
            {WEEKDAY_HE[today]}
          </span>
        </div>
        <div className="space-y-3">
          {WEEKDAY_HE.map((label, idx) => {
            const slot = bySlot.get(idx);
            const tpl = slot?.template_id
              ? templatesQ.data?.find((x) => x.id === slot.template_id)
              : null;
            const done = slot?.template_id
              ? doneIds.has(slot.template_id)
              : false;
            const isNext = idx === nextWeekday;
            const isToday = idx === today;
            const image = slot?.template_id
              ? exImagesQ.data?.get(slot.template_id) ?? heroImage
              : null;
            return (
              <div
                key={idx}
                className={`flex items-center gap-3 rounded-3xl border p-3 transition ${
                  isNext
                    ? "border-primary bg-card shadow-glow"
                    : done
                      ? "border-primary/30 bg-primary/[0.04]"
                      : "border-border bg-card"
                }`}
              >
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-muted">
                  {image ? (
                    <img
                      src={image}
                      alt=""
                      className={`h-full w-full object-cover ${done ? "opacity-40" : ""}`}
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-2xl">
                      <Dumbbell className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  {done && (
                    <div className="absolute inset-0 grid place-items-center bg-primary/25">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
                        <Check className="h-5 w-5" strokeWidth={3} />
                      </span>
                    </div>
                  )}
                </div>
                <button
                  className="min-w-0 flex-1 text-right"
                  onClick={() => setEditing(idx)}
                >
                  <p
                    className={`text-[11px] uppercase tracking-wider ${
                      isNext ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    יום {label}
                    {isToday ? " · היום" : ""}
                    {isNext ? " · הבא" : ""}
                  </p>
                  <p className="truncate text-base font-bold">
                    {tpl?.name ?? slot?.display_name ?? "יום חופש"}
                  </p>
                </button>
                {slot?.template_id ? (
                  done ? (
                    <span className="text-xs font-semibold text-primary">הושלם</span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => start.mutate(slot)}
                      disabled={start.isPending}
                    >
                      <Play className="ml-1 h-3.5 w-3.5" /> התחל
                    </Button>
                  )
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(idx)}
                  >
                    שיוך
                    <ChevronLeft className="mr-1 h-4 w-4 rtl:rotate-180" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
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
    mutationFn: async () => setPlanSlot(weekday, templateId || null, null),
    onSuccess: onSaved,
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: async () => setPlanSlot(weekday, null, null),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
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
