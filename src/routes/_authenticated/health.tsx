import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Plus, HeartPulse, Info, Pencil, ShieldCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { today } from "@/lib/date";
import { format } from "date-fns";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Row } from "@/types/database";

export const Route = createFileRoute("/_authenticated/health")({
  component: HealthPage,
});

const AREAS = ["neck", "sciatica", "ac_joint", "general"] as const;

type MedicalIssue = Row<"medical_issues">;
type IssueStatus = "active" | "monitoring" | "resolved";
type IssueImportance = "low" | "medium" | "high";

const STATUS_LABEL: Record<IssueStatus, string> = {
  active: "פעיל",
  monitoring: "במעקב",
  resolved: "נפתר",
};
const IMPORTANCE_LABEL: Record<IssueImportance, string> = {
  low: "נמוכה",
  medium: "בינונית",
  high: "גבוהה",
};
const STATUS_ORDER: Record<string, number> = { active: 0, monitoring: 1, resolved: 2 };
const IMPORTANCE_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function HealthPage() {
  return (
    <div className="space-y-5">
      <HealthHero />
      <MedicalIssuesSection />
      <SymptomsSection />
      <MedicalDisclaimer />
    </div>
  );
}

/* ------------------------------- Health Hero ------------------------------ */

function HealthHero() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[hsl(0_60%_40%/0.35)] p-5 shadow-soft">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(120% 100% at 100% 0%, hsl(348 70% 32% / 0.85) 0%, hsl(345 55% 18% / 0.9) 45%, hsl(240 12% 7%) 100%)",
        }}
      />
      <div className="pointer-events-none absolute -end-10 -top-10 -z-10 h-44 w-44 rounded-full bg-[hsl(348_80%_45%/0.35)] blur-2xl motion-safe:animate-pulse" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-white/70">
            <HeartPulse className="h-3.5 w-3.5" /> מרכז הבריאות
          </p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-4xl font-bold leading-none text-white">--</span>
            <span className="pb-0.5 text-sm text-white/60">/ 100</span>
          </div>
          <p className="mt-2 text-sm text-white/80">אין עדיין מספיק מידע מאומת</p>
        </div>
        <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-medium text-white/85 backdrop-blur">
          מהימנות: מוגבלת
        </span>
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-white/60">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        מדד תמיכה של Viora בלבד — אינו מדד רפואי קליני ואינו אבחנה.
      </p>
    </section>
  );
}

/* --------------------------- Medical Issues list -------------------------- */

type IssueDraft = {
  id?: string;
  title: string;
  summary: string;
  status: IssueStatus;
  importance: IssueImportance;
  started_on: string;
  source_type: string;
};

const EMPTY_DRAFT: IssueDraft = {
  title: "",
  summary: "",
  status: "active",
  importance: "medium",
  started_on: "",
  source_type: "user_reported",
};

function MedicalIssuesSection() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<IssueDraft>(EMPTY_DRAFT);

  const issuesQ = useQuery({
    queryKey: ["medical_issues"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return [] as MedicalIssue[];
      const { data, error } = await supabase
        .from("medical_issues")
        .select("*")
        .eq("user_id", userRes.user.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as MedicalIssue[];
    },
  });

  const issues = useMemo(() => {
    const list = issuesQ.data ?? [];
    return [...list].sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
        (IMPORTANCE_ORDER[a.importance] ?? 9) - (IMPORTANCE_ORDER[b.importance] ?? 9),
    );
  }, [issuesQ.data]);

  const save = useMutation({
    mutationFn: async (d: IssueDraft) => {
      const title = d.title.trim();
      if (!title) throw new Error("נדרשת כותרת");
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("לא מחובר");
      const payload = {
        title,
        summary: d.summary.trim() || null,
        status: d.status,
        importance: d.importance,
        started_on: d.started_on || null,
        source_type: d.source_type,
      };
      if (d.id) {
        const { error } = await supabase
          .from("medical_issues")
          .update(payload)
          .eq("id", d.id)
          .eq("user_id", userRes.user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("medical_issues")
          .insert({ ...payload, user_id: userRes.user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["medical_issues"] });
      setOpen(false);
      setDraft(EMPTY_DRAFT);
      toast.success("נשמר");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: IssueStatus }) => {
      const { error } = await supabase.from("medical_issues").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["medical_issues"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("medical_issues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["medical_issues"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setDraft(EMPTY_DRAFT);
    setOpen(true);
  };
  const openEdit = (i: MedicalIssue) => {
    setDraft({
      id: i.id,
      title: i.title,
      summary: i.summary ?? "",
      status: (i.status as IssueStatus) ?? "active",
      importance: (i.importance as IssueImportance) ?? "medium",
      started_on: i.started_on ?? "",
      source_type: i.source_type ?? "user_reported",
    });
    setOpen(true);
  };

  const activeCount = issues.filter((i) => i.status !== "resolved").length;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">נושאים רפואיים פעילים</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">רשומות שאתה מנהל בעצמך</p>
        </div>
        <Button size="sm" variant="secondary" onClick={openNew}>
          <Plus className="me-1 h-4 w-4" /> הוסף
        </Button>
      </div>

      <div className="space-y-2">
        {issues.length === 0 ? (
          <div className="surface-card p-5 text-center">
            <p className="text-sm font-medium">אין עדיין נושאים רפואיים</p>
            <p className="mt-1 text-xs text-muted-foreground">הוסף את הנושא הרפואי הראשון כדי לבנות את התמונה הרפואית שלך.</p>
          </div>
        ) : (
          issues.map((i) => (
            <div key={i.id} className="surface-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn("font-medium", i.status === "resolved" && "text-muted-foreground line-through")}>
                    {i.title}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={i.status === "active" ? "danger" : i.status === "monitoring" ? "warn" : "ok"}>
                      {STATUS_LABEL[i.status as IssueStatus] ?? i.status}
                    </Badge>
                    <Badge tone="neutral">
                      חשיבות: {IMPORTANCE_LABEL[i.importance as IssueImportance] ?? i.importance}
                    </Badge>
                    {i.started_on && (
                      <Badge tone="neutral">מאז {format(new Date(i.started_on), "d MMM yyyy")}</Badge>
                    )}
                  </div>
                  {i.summary && <p className="mt-2 text-xs text-muted-foreground">{i.summary}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <button onClick={() => openEdit(i)} className="text-muted-foreground hover:text-primary" aria-label="עריכה">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => remove.mutate(i.id)} className="text-muted-foreground hover:text-destructive" aria-label="מחיקה">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(["active", "monitoring", "resolved"] as IssueStatus[])
                  .filter((s) => s !== i.status)
                  .map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full px-3 text-xs"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: i.id, status: s })}
                    >
                      {s === "resolved" ? <CheckCircle2 className="me-1 h-3.5 w-3.5" /> : null}
                      {s === "resolved" ? "סמן כנפתר" : `העבר ל${STATUS_LABEL[s]}`}
                    </Button>
                  ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Safe next action */}
      <div className="surface-card flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">הצעד הבא</p>
          <p className="mt-1 text-sm">
            {activeCount === 0
              ? "הוסף את הנושא הרפואי הראשון שלך."
              : `יש לך ${activeCount} נושאים פתוחים — כדאי לעבור עליהם ולעדכן מצב.`}
          </p>
        </div>
        {activeCount === 0 ? (
          <Button size="sm" onClick={openNew} className="shrink-0">
            הוסף נושא
          </Button>
        ) : (
          <span className="shrink-0 text-muted-foreground">
            <ShieldCheck className="h-5 w-5" />
          </span>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{draft.id ? "עריכת נושא רפואי" : "נושא רפואי חדש"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>כותרת</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="לדוגמה: כאבי צוואר כרוניים"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>מצב</Label>
                <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v as IssueStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as IssueStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>חשיבות</Label>
                <Select
                  value={draft.importance}
                  onValueChange={(v) => setDraft((d) => ({ ...d, importance: v as IssueImportance }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(IMPORTANCE_LABEL) as IssueImportance[]).map((s) => (
                      <SelectItem key={s} value={s}>{IMPORTANCE_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>תאריך התחלה</Label>
              <Input
                type="date"
                value={draft.started_on}
                onChange={(e) => setDraft((d) => ({ ...d, started_on: e.target.value }))}
              />
            </div>
            <div>
              <Label>תקציר</Label>
              <Textarea
                rows={3}
                value={draft.summary}
                onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                placeholder="מה חשוב לזכור על הנושא הזה"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate(draft)} disabled={save.isPending} className="w-full">
              שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "danger" | "warn" | "ok" | "neutral" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
        tone === "danger" && "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "warn" && "border-primary/40 bg-primary/10 text-primary",
        tone === "ok" && "border-success/40 bg-success/10 text-success",
        tone === "neutral" && "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------- Symptoms & tracking (legacy) ------------------- */

function SymptomsSection() {
  const qc = useQueryClient();
  const [area, setArea] = useState<typeof AREAS[number]>("neck");
  const [pain, setPain] = useState("3");
  const [mobility, setMobility] = useState("7");
  const [exercisesDone, setExercisesDone] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(today());

  const logsQ = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const { data, error } = await supabase.from("health_logs").select("*").order("date", { ascending: false }).limit(30);
      if (error) throw error;
      return data;
    },
  });

  const addLog = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not signed in");
      const { error } = await supabase.from("health_logs").insert({
        user_id: userRes.user.id,
        date,
        area,
        pain_level: Number(pain),
        mobility_score: Number(mobility),
        exercises_done: exercisesDone || null,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["health"] });
      qc.invalidateQueries({ queryKey: ["health", "today"] });
      qc.invalidateQueries({ queryKey: ["health", "recent"] });
      setExercisesDone(""); setNotes("");
      toast.success(t("health.saved"));
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("health_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["health"] }),
  });

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight">סימפטומים ומעקב</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("health.subtitle")}</p>
      </div>

      <div className="surface-card space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>{t("health.area")}</Label>
            <Select value={area} onValueChange={(v) => setArea(v as typeof area)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{AREAS.map((a) => <SelectItem key={a} value={a}>{t(`health.area.${a}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("health.date")}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <SliderRow label={t("health.pain")} hint={t("health.painHint")} value={pain} onChange={setPain} accent="destructive" />
        <SliderRow label={t("health.mobility")} hint={t("health.mobilityHint")} value={mobility} onChange={setMobility} accent="success" />
        <div>
          <Label>{t("health.exercisesDone")}</Label>
          <Input placeholder={t("health.exercisesPh")} value={exercisesDone} onChange={(e) => setExercisesDone(e.target.value)} />
        </div>
        <div>
          <Label>{t("health.notes")}</Label>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <Button onClick={() => addLog.mutate()} disabled={addLog.isPending} className="w-full">
          <Plus className="mr-1 h-4 w-4" /> {t("health.log")}
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("health.history")}</h3>
        <div className="surface-card divide-y divide-border">
          {logsQ.data?.length ? logsQ.data.map((l) => (
            <div key={l.id} className="flex items-start justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">{t(`health.area.${l.area}`)} <span className="text-xs text-muted-foreground">· {format(new Date(l.date), "EEE d MMM")}</span></p>
                <p className="text-xs text-muted-foreground">
                  {t("health.pain")} <b className="text-destructive">{l.pain_level}</b>/10 · {t("health.mobility")} <b className="text-success">{l.mobility_score}</b>/10
                </p>
                {l.notes && <p className="text-xs mt-1 text-muted-foreground truncate">{l.notes}</p>}
              </div>
              <button onClick={() => remove.mutate(l.id)} className="text-muted-foreground hover:text-destructive shrink-0 ms-2">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("health.empty")}</p>}
        </div>
      </div>
    </section>
  );
}

function MedicalDisclaimer() {
  return (
    <p className="rounded-2xl border border-border/60 bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
      Viora מספקת מידע, מעקב ותובנות כלליות בלבד ואינה מחליפה רופא, אבחון או ייעוץ רפואי מקצועי. החלטות רפואיות יש לקבל עם
      גורם רפואי מוסמך.
    </p>
  );
}

function SliderRow({ label, hint, value, onChange, accent }: {
  label: string; hint: string; value: string; onChange: (v: string) => void; accent: "destructive" | "success";
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label>{label}: <span className={accent === "destructive" ? "text-destructive font-bold" : "text-success font-bold"}>{value}</span>/10</Label>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-primary"
      />
    </div>
  );
}
