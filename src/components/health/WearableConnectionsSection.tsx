/**
 * "חיבור שעון ובריאות" — CORE-005 connector surface, HEALTH-007 entry point.
 *
 * Google Health Connect and Garmin need work Viora's web/PWA shell can't do
 * yet (a native Android wrapper for Health Connect; a Garmin OAuth grant),
 * so those two rows are honestly "בקרוב" rather than fake toggles. Manual
 * entry is real today and writes into the same `health_metrics` table a
 * future native sync would use, so nothing here needs to change once that
 * lands.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, HeartPulse, Link2, Moon, Watch } from "lucide-react";
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { fetchConnections, fetchRecentMetrics, recordManualMetric } from "@/lib/health-metrics";
import { latestByType, METRIC_LABEL, PROVIDER_LABEL, type HealthMetricType } from "@/lib/health-metrics-core";

const COMING_SOON_COPY: Record<"health_connect" | "garmin", string> = {
  health_connect:
    "חיבור אוטומטי ל-Health Connect דורש גרסת אפליקציה נייטיבית לאנדרואיד ועדיין לא זמין. אפשר להזין נתונים ידנית בינתיים.",
  garmin:
    "חיבור ל-Garmin Connect דורש הרשאה מול חשבון Garmin שלך ועדיין לא זמין. אפשר להזין נתונים ידנית בינתיים.",
};

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function WearableConnectionsSection() {
  const qc = useQueryClient();
  const [comingSoon, setComingSoon] = useState<"health_connect" | "garmin" | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const connectionsQ = useQuery({ queryKey: ["health-connections"], queryFn: fetchConnections });
  const metricsQ = useQuery({ queryKey: ["health-metrics", "recent"], queryFn: () => fetchRecentMetrics(14) });

  const manualConnected = (connectionsQ.data ?? []).some((c) => c.provider === "manual");
  const latest = latestByType(metricsQ.data ?? []);

  return (
    <section className="space-y-3">
      <SectionHeader title="חיבור שעון ובריאות" subtitle="נתוני שעון מזינים את ה-AI ואת ציון ההתאוששות" />

      <PremiumCard className="space-y-1 p-2">
        <ConnectionRow
          icon={<Watch className="h-5 w-5" aria-hidden />}
          title={PROVIDER_LABEL.health_connect}
          status="בקרוב"
          onClick={() => setComingSoon("health_connect")}
        />
        <ConnectionRow
          icon={<Watch className="h-5 w-5" aria-hidden />}
          title={PROVIDER_LABEL.garmin}
          status="בקרוב"
          onClick={() => setComingSoon("garmin")}
        />
        <ConnectionRow
          icon={<Link2 className="h-5 w-5" aria-hidden />}
          title={PROVIDER_LABEL.manual}
          status={manualConnected ? "פעיל" : "לא הוזן"}
          active={manualConnected}
          onClick={() => setManualOpen(true)}
        />
      </PremiumCard>

      {(latest.heart_rate_resting || latest.sleep_minutes || latest.steps || latest.calories_burned) && (
        <PremiumCard className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricTile icon={<HeartPulse className="h-4 w-4" />} label={METRIC_LABEL.heart_rate_resting} metric={latest.heart_rate_resting} />
          <MetricTile icon={<Moon className="h-4 w-4" />} label={METRIC_LABEL.sleep_minutes} metric={latest.sleep_minutes} formatMinutesAsHours />
          <MetricTile icon={<Clock className="h-4 w-4" />} label={METRIC_LABEL.steps} metric={latest.steps} />
          <MetricTile icon={<Clock className="h-4 w-4" />} label={METRIC_LABEL.calories_burned} metric={latest.calories_burned} />
        </PremiumCard>
      )}

      <ComingSoonSheet provider={comingSoon} onOpenChange={(v) => !v && setComingSoon(null)} />
      <ManualEntrySheet
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["health-connections"] });
          qc.invalidateQueries({ queryKey: ["health-metrics"] });
        }}
      />
    </section>
  );
}

function ConnectionRow({
  icon,
  title,
  status,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  status: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-2xl px-2 py-2.5 text-right transition active:scale-[0.99] hover:bg-muted/30"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
            active ? "bg-success/15 text-success" : "bg-muted/50 text-muted-foreground",
          )}
        >
          {icon}
        </span>
        <p className="truncate text-[13px] font-bold">{title}</p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold",
          active ? "bg-success/20 text-success" : "bg-muted/50 text-muted-foreground",
        )}
      >
        {status}
      </span>
    </button>
  );
}

function MetricTile({
  icon,
  label,
  metric,
  formatMinutesAsHours,
}: {
  icon: React.ReactNode;
  label: string;
  metric: { value: number; recorded_at: string } | undefined;
  formatMinutesAsHours?: boolean;
}) {
  if (!metric) return null;
  const display = formatMinutesAsHours ? (metric.value / 60).toFixed(1) : Math.round(metric.value).toLocaleString("he-IL");
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-lg font-bold tabular-nums">
        {display}
        {formatMinutesAsHours && <span className="text-xs text-muted-foreground"> שעות</span>}
      </p>
      <p className="text-[10px] text-muted-foreground">{formatWhen(metric.recorded_at)}</p>
    </div>
  );
}

function ComingSoonSheet({
  provider,
  onOpenChange,
}: {
  provider: "health_connect" | "garmin" | null;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={provider !== null} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="border-0 bg-transparent p-0 shadow-none">
        <div dir="rtl" className="mx-auto w-full max-w-2xl px-3 pb-[env(safe-area-inset-bottom)]">
          <div className="relative overflow-hidden rounded-t-[32px] border border-border/60 bg-card/95 p-5 text-right backdrop-blur-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-foreground/15" />
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary">
                <Watch className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-extrabold leading-tight">{provider ? PROVIDER_LABEL[provider] : ""}</h2>
                <p className="text-[11px] text-muted-foreground">בקרוב</p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {provider ? COMING_SOON_COPY[provider] : ""}
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const MANUAL_FIELDS: { type: HealthMetricType; label: string; placeholder: string }[] = [
  { type: "heart_rate_resting", label: "דופק במנוחה (bpm)", placeholder: "למשל 58" },
  { type: "sleep_minutes", label: "שעות שינה", placeholder: "למשל 7.5" },
  { type: "steps", label: "צעדים", placeholder: "למשל 8500" },
  { type: "calories_burned", label: "קלוריות שנשרפו", placeholder: "למשל 420" },
];

function ManualEntrySheet({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: async () => {
      const entries = MANUAL_FIELDS.filter((f) => values[f.type]);
      if (entries.length === 0) throw new Error("הזן לפחות ערך אחד");
      for (const f of entries) {
        const raw = Number(values[f.type]);
        const value = f.type === "sleep_minutes" ? raw * 60 : raw;
        await recordManualMetric(f.type, value);
      }
    },
    onSuccess: () => {
      toast.success("הנתונים נשמרו");
      setValues({});
      onOpenChange(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="border-0 bg-transparent p-0 shadow-none">
        <div dir="rtl" className="mx-auto w-full max-w-2xl px-3 pb-[env(safe-area-inset-bottom)]">
          <div className="relative overflow-hidden rounded-t-[32px] border border-border/60 bg-card/95 p-5 text-right backdrop-blur-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-foreground/15" />
            <h2 className="text-[16px] font-extrabold leading-tight">הזנת נתונים ידנית</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">מה שיש לך עכשיו מהשעון — לא חובה למלא הכל</p>

            <div className="mt-4 space-y-3">
              {MANUAL_FIELDS.map((f) => (
                <div key={f.type} className="space-y-1">
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    inputMode="decimal"
                    placeholder={f.placeholder}
                    value={values[f.type] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.type]: e.target.value.replace(/[^0-9.]/g, "") }))}
                    className="text-right"
                  />
                </div>
              ))}
            </div>

            <Button
              className="mt-4 min-h-12 w-full rounded-2xl font-bold"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              שמירה
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
