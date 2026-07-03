/**
 * Hydration Center — the dedicated 💧 page for logging, tracking and
 * getting hydration insights. Data lives in `daily_events` (kind=water)
 * so the Home Screen AI reads the same source of truth automatically.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Droplet, ChevronLeft, Plus, Trash2, Pencil, Check, X, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/ui-kit/Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { biologicalDay } from "@/lib/meals";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/hydration")({
  component: HydrationPage,
});

type WaterEvent = {
  id: string;
  amount: number | null;
  event_time: string;
  unit: string | null;
};

const PRESETS: { label: string; amount: number; emoji: string }[] = [
  { label: "כוס", amount: 250, emoji: "☕" },
  { label: "בקבוק קטן", amount: 330, emoji: "🥤" },
  { label: "בקבוק", amount: 500, emoji: "🧃" },
  { label: "בקבוק גדול", amount: 750, emoji: "🚰" },
  { label: "ליטר", amount: 1000, emoji: "💧" },
];

function HydrationPage() {
  const qc = useQueryClient();
  const bioDay = biologicalDay(new Date());
  const todayIso = format(new Date(), "yyyy-MM-dd");
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("");

  const profileQ = useQuery({
    queryKey: ["profile", "hydration"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("water_target_ml,current_weight_kg")
        .maybeSingle();
      return data;
    },
  });

  const eventsQ = useQuery({
    queryKey: ["daily-events", "water", bioDay],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_events")
        .select("id,amount,event_time,unit")
        .eq("kind", "water")
        .eq("biological_day", bioDay)
        .order("event_time", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WaterEvent[];
    },
  });

  const recentDaysQ = useQuery({
    queryKey: ["hydration-recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_events")
        .select("amount,biological_day")
        .eq("kind", "water")
        .order("event_time", { ascending: false })
        .limit(120);
      const map = new Map<string, number>();
      for (const r of data ?? []) {
        const d = r.biological_day as string;
        map.set(d, (map.get(d) ?? 0) + Number(r.amount ?? 0));
      }
      return map;
    },
  });

  const target = profileQ.data?.water_target_ml ?? 2500;
  const consumed = (eventsQ.data ?? []).reduce(
    (s, e) => s + Number(e.amount ?? 0),
    0,
  );
  const remaining = Math.max(0, target - consumed);
  const pct = Math.min(1, target > 0 ? consumed / target : 0);
  const pctRounded = Math.round(pct * 100);

  const addWater = useMutation({
    mutationFn: async (amount: number) => {
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("כמות לא תקינה");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("no user");
      const { error } = await supabase.from("daily_events").insert({
        user_id: u.user.id,
        kind: "water",
        event_date: todayIso,
        biological_day: bioDay,
        amount,
        unit: "מ״ל",
        emoji: "💧",
      });
      if (error) throw error;
    },
    onSuccess: (_d, amount) => {
      toast.success(`💧 ${amount} מ״ל נרשמו`);
      qc.invalidateQueries({ queryKey: ["daily-events"] });
      qc.invalidateQueries({ queryKey: ["hydration-recent"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("נמחק");
      qc.invalidateQueries({ queryKey: ["daily-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { error } = await supabase
        .from("daily_events")
        .update({ amount })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("עודכן");
      qc.invalidateQueries({ queryKey: ["daily-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Bottle animation height
  const bottleFill = Math.max(4, Math.round(pct * 100));

  // Insights
  const insights: string[] = [];
  const map = recentDaysQ.data;
  if (map) {
    const avg =
      Array.from(map.values()).length > 1
        ? Array.from(map.values()).reduce((a, b) => a + b, 0) / map.size
        : 0;
    if (avg > 0 && consumed < avg * 0.7) {
      insights.push(`היום שתית פחות מהממוצע שלך (${Math.round(avg)} מ״ל).`);
    }
    if (consumed >= target) {
      insights.push("הגעת ליעד ההידרציה היומי — עבודה מצוינת! 💧");
    } else if (remaining <= 300) {
      insights.push(`נותרו רק ${remaining} מ״ל עד היעד — כמעט שם!`);
    }
  }
  if ((eventsQ.data ?? []).length === 0) {
    insights.push("עדיין לא רשמת שתייה היום — התחל עם כוס אחת.");
  }
  const hour = new Date().getHours();
  if (hour >= 20 && consumed < target * 0.7) {
    insights.push("שים לב — הערב מתקדם ועדיין נותר לך מרווח גדול עד היעד.");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link
          to="/dashboard"
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
          aria-label={t("common.close")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">מרכז השתייה</h1>
          <p className="text-xs text-muted-foreground">
            הידרציה חכמה — משפיעה על אנרגיה, ריכוז והתאוששות
          </p>
        </div>
      </div>

      {/* Big bottle + stats */}
      <PremiumCard className="relative overflow-hidden border-sky-500/30 p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(circle at 20% 10%, rgba(56,189,248,0.35), transparent 60%), radial-gradient(circle at 80% 90%, rgba(14,165,233,0.3), transparent 55%)",
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-6">
          {/* Bottle */}
          <div className="relative h-56 w-32 shrink-0">
            {/* Bottle shape */}
            <div className="absolute inset-x-3 top-0 h-4 rounded-t-md bg-sky-950/50 border border-sky-400/40 border-b-0" />
            <div className="absolute inset-x-6 top-4 h-3 bg-sky-950/60 border-x border-sky-400/40" />
            <div className="absolute inset-x-0 top-7 bottom-0 overflow-hidden rounded-3xl border-2 border-sky-400/50 bg-sky-950/50">
              {/* Water */}
              <div
                className="absolute inset-x-0 bottom-0 transition-all duration-700 ease-out"
                style={{ height: `${bottleFill}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-sky-600 via-sky-400 to-cyan-300" />
                {/* Wave */}
                <svg
                  viewBox="0 0 120 20"
                  preserveAspectRatio="none"
                  className="absolute -top-3 left-0 h-4 w-full animate-pulse"
                  aria-hidden
                >
                  <path
                    d="M0 10 Q 15 0 30 10 T 60 10 T 90 10 T 120 10 V20 H0 Z"
                    fill="rgb(56 189 248)"
                  />
                </svg>
                <svg
                  viewBox="0 0 120 20"
                  preserveAspectRatio="none"
                  className="absolute -top-2 left-0 h-3 w-full opacity-70"
                  aria-hidden
                >
                  <path
                    d="M0 10 Q 20 20 40 10 T 80 10 T 120 10 V20 H0 Z"
                    fill="rgb(103 232 249)"
                  />
                </svg>
              </div>
              {/* Center label */}
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p className="text-3xl font-bold tabular-nums text-white drop-shadow">
                    {pctRounded}%
                  </p>
                  <Droplet className="mx-auto mt-1 h-4 w-4 text-white/85" />
                </div>
              </div>
            </div>
          </div>

          {/* Numbers */}
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300">
                יעד יומי
              </p>
              <p className="text-2xl font-bold tabular-nums">
                {(target / 1000).toFixed(1)}
                <span className="text-sm text-muted-foreground"> ליטר</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300">
                שתיתי היום
              </p>
              <p className="text-2xl font-bold tabular-nums text-sky-400">
                {(consumed / 1000).toFixed(2)}
                <span className="text-sm text-muted-foreground"> ליטר</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300">
                נותר
              </p>
              <p className="text-xl font-bold tabular-nums text-foreground/90">
                {remaining} <span className="text-xs text-muted-foreground">מ״ל</span>
              </p>
            </div>
          </div>
        </div>
      </PremiumCard>

      {/* Quick add */}
      <section>
        <SectionHeader title="הוספה מהירה" subtitle="כל לחיצה נרשמת מיד ומעדכנת את ה-AI" />
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.amount}
              disabled={addWater.isPending}
              onClick={() => addWater.mutate(p.amount)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl border border-sky-400/40 bg-sky-500/10 px-2 py-3 transition",
                "hover:bg-sky-500/20 hover:border-sky-400/70 active:scale-95",
                "disabled:opacity-50",
              )}
            >
              <span className="text-2xl">{p.emoji}</span>
              <span className="text-sm font-bold tabular-nums text-sky-100">
                {p.amount}
              </span>
              <span className="text-[10px] text-sky-300/80">מ״ל · {p.label}</span>
            </button>
          ))}
          <button
            disabled={addWater.isPending}
            onClick={() => setCustomOpen((v) => !v)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-sky-400/50 bg-sky-500/5 px-2 py-3 transition",
              "hover:bg-sky-500/10 active:scale-95",
              "disabled:opacity-50",
            )}
          >
            <Plus className="h-5 w-5 text-sky-300" />
            <span className="text-xs font-semibold text-sky-200">כמות מותאמת</span>
          </button>
        </div>
        {customOpen && (
          <PremiumCard className="mt-3 flex items-center gap-2">
            <Input
              inputMode="numeric"
              placeholder="למשל 400"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value.replace(/[^0-9]/g, ""))}
              className="text-right"
            />
            <span className="text-xs text-muted-foreground">מ״ל</span>
            <Button
              size="sm"
              disabled={!customAmount || addWater.isPending}
              onClick={() => {
                const n = Number(customAmount);
                if (n > 0) {
                  addWater.mutate(n);
                  setCustomAmount("");
                  setCustomOpen(false);
                }
              }}
            >
              הוסף
            </Button>
          </PremiumCard>
        )}
      </section>

      {/* Insights */}
      {insights.length > 0 && (
        <section>
          <SectionHeader title="תובנות הידרציה" />
          <PremiumCard className="border-sky-500/30 bg-sky-500/5">
            <ul className="space-y-2">
              {insights.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </PremiumCard>
        </section>
      )}

      {/* History */}
      <section>
        <SectionHeader title="ההיסטוריה של היום" subtitle={`${(eventsQ.data ?? []).length} רישומים`} />
        <PremiumCard className="p-0 overflow-hidden">
          {eventsQ.isLoading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">טוען...</p>
          ) : (eventsQ.data ?? []).length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Droplet className="h-5 w-5" />}
                title="עוד לא רשמת שתייה היום"
              />
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {(eventsQ.data ?? []).map((e) => (
                <HistoryRow
                  key={e.id}
                  ev={e}
                  onDelete={() => del.mutate(e.id)}
                  onPatch={(amount) => patch.mutate({ id: e.id, amount })}
                />
              ))}
            </ul>
          )}
        </PremiumCard>
      </section>
    </div>
  );
}

function HistoryRow({
  ev,
  onDelete,
  onPatch,
}: {
  ev: WaterEvent;
  onDelete: () => void;
  onPatch: (amount: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(ev.amount ?? ""));

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="text-lg">💧</span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              inputMode="numeric"
              value={val}
              onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-8 w-24 text-right"
            />
            <span className="text-xs text-muted-foreground">מ״ל</span>
          </div>
        ) : (
          <p className="text-sm font-semibold tabular-nums">
            {ev.amount} <span className="text-xs text-muted-foreground">מ״ל</span>
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          {format(new Date(ev.event_time), "HH:mm")}
        </p>
      </div>
      {editing ? (
        <>
          <button
            onClick={() => {
              const n = Number(val);
              if (n > 0) {
                onPatch(n);
                setEditing(false);
              }
            }}
            className="grid h-8 w-8 place-items-center rounded-full bg-sky-500/20 text-sky-300"
            aria-label="שמור"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            onClick={() => setEditing(false)}
            className="grid h-8 w-8 place-items-center rounded-full bg-muted/50 text-muted-foreground"
            aria-label="בטל"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => setEditing(true)}
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            aria-label="ערוך"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            className="grid h-8 w-8 place-items-center rounded-full text-destructive hover:bg-destructive/10"
            aria-label="מחק"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </li>
  );
}
