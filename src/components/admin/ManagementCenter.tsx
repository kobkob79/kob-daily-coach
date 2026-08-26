import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  ChevronLeft,
  Database,
  FlaskConical,
  Gauge,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { BuildInfo } from "@/components/BuildInfo";
import { AboutMediaManager } from "@/components/admin/AboutMediaManager";
import { MediaInboxCard } from "@/components/media/MediaInboxCard";
import { Button } from "@/components/ui/button";
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import { getAdminSystemOverview } from "@/lib/admin-overview.functions";
import { isDevConsoleEnabled } from "@/lib/dev-console";
import { getMyPlan } from "@/lib/entitlements.functions";
import { useVioraPlanUI, type VioraPlan } from "@/lib/plan-ui";
import { cn } from "@/lib/utils";
import { getLiveExerciseRegistry } from "@/services";

const ENVIRONMENT_LABELS = {
  development: "Development",
  production: "Production",
  test: "Test",
  unknown: "Unknown",
} as const;

type StatusTone = "active" | "future" | "readOnly" | "error" | "neutral";

const STATUS_STYLES: Record<StatusTone, string> = {
  active: "border-primary/35 bg-primary/10 text-primary",
  future: "border-border/70 bg-muted/35 text-muted-foreground",
  readOnly: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  neutral: "border-border/70 bg-card/80 text-muted-foreground",
};

const CONTROL_SURFACE = "border-border/70 bg-card/85 shadow-sm backdrop-blur-md";

function StatusChip({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold leading-none",
        STATUS_STYLES[tone],
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full bg-current",
          tone === "future" || tone === "neutral" ? "opacity-60" : "opacity-90",
        )}
      />
      {children}
    </span>
  );
}

function CompactMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/70 bg-card/75 px-3 py-2.5">
      <p className="text-[9px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

function CompactRow({
  icon: Icon,
  title,
  technicalLabel,
  description,
  to,
  status,
  active = false,
}: {
  icon: LucideIcon;
  title: string;
  technicalLabel?: string;
  description: string;
  to?: "/dev";
  status?: { label: string; tone: StatusTone };
  active?: boolean;
}) {
  const content = (
    <div
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-2.5 transition",
        active
          ? "border-primary/25 bg-card/85 shadow-sm"
          : "border-border/60 bg-card/55 text-foreground/85",
        to && "hover:border-primary/35 active:scale-[0.99]",
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
          active ? "bg-primary/12 text-primary" : "bg-muted/45 text-muted-foreground",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-[13px] font-bold">{title}</span>
          {technicalLabel && (
            <span className="truncate text-[9px] font-medium text-foreground/45" dir="ltr">
              {technicalLabel}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
          {description}
        </span>
      </span>
      {status && <StatusChip tone={status.tone}>{status.label}</StatusChip>}
      {to && <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
    </div>
  );

  return to ? <Link to={to}>{content}</Link> : content;
}

function PlanControl({
  authoritativePlan,
  authoritativeStatus,
  isPending,
}: {
  authoritativePlan?: string;
  authoritativeStatus?: string;
  isPending: boolean;
}) {
  const { hydrated, plan, setPlan } = useVioraPlanUI();

  const selectPlan = (next: VioraPlan) => {
    if (hydrated) setPlan(next);
  };

  return (
    <PremiumCard className={cn(CONTROL_SURFACE, "space-y-3 p-3.5")}>
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold">התוכנית של החשבון</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {isPending
              ? "טוען entitlement…"
              : authoritativePlan
                ? `${authoritativePlan.toUpperCase()} · ${authoritativeStatus}`
                : "לא זמין כרגע"}
          </p>
        </div>
        <StatusChip tone="readOnly">קריאה בלבד</StatusChip>
      </div>

      <div className="flex items-center gap-2 border-t border-border/60 pt-3">
        <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
          כלי QA מקומי
        </span>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-xl border border-border/60 bg-muted/20 p-1">
          {(["free", "premium"] as const).map((option) => (
            <button
              key={option}
              type="button"
              disabled={!hydrated}
              onClick={() => selectPlan(option)}
              className={cn(
                "min-h-9 rounded-lg text-[10px] font-bold transition disabled:opacity-50",
                plan === option
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-card/70",
              )}
            >
              {option === "free" ? "Free" : "Premium"}
            </button>
          ))}
        </div>
      </div>
    </PremiumCard>
  );
}

export function ManagementCenter() {
  const overviewQ = useQuery({
    queryKey: ["admin", "system-overview"],
    queryFn: getAdminSystemOverview,
    staleTime: 60_000,
  });
  const planQ = useQuery({ queryKey: ["my-plan"], queryFn: getMyPlan, staleTime: 30_000 });
  const registryQ = useQuery({
    queryKey: ["admin", "exercise-registry"],
    queryFn: getLiveExerciseRegistry,
    staleTime: 30_000,
  });
  const registry = registryQ.data?.dashboard;
  const devConsoleEnabled = isDevConsoleEnabled();

  return (
    <div className="space-y-5 pb-6" dir="rtl">
      <header className="space-y-2.5">
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
            aria-label="חזרה"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Viora Management Center
            </h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">מרכז הניהול והבקרה של Viora</p>
          </div>
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        </div>
        <div className="flex flex-wrap items-center gap-2 pr-[52px]">
          <StatusChip tone="active">Admin</StatusChip>
          <BuildInfo />
        </div>
      </header>

      <section>
        <SectionHeader className="mb-2" title="צוות וגלריות" subtitle="About media management" />
        <AboutMediaManager />
      </section>

      <section>
        <SectionHeader
          className="mb-2"
          title="מערכת ו־AI"
          subtitle="System overview · Advisor infrastructure"
        />
        {overviewQ.isPending ? (
          <PremiumCard className={cn(CONTROL_SURFACE, "grid min-h-24 place-items-center p-3")}>
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </PremiumCard>
        ) : overviewQ.isError || !overviewQ.data ? (
          <PremiumCard className={cn(CONTROL_SURFACE, "flex items-center gap-3 p-3.5")}>
            <p className="min-w-0 flex-1 text-xs font-semibold">מצב המערכת אינו זמין כרגע</p>
            <Button variant="outline" size="sm" onClick={() => void overviewQ.refetch()}>
              <RefreshCw className="ml-1 h-3.5 w-3.5" /> ניסיון נוסף
            </Button>
          </PremiumCard>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5">
              <CompactMetric label="Role" value={overviewQ.data.role} />
              <CompactMetric
                label="Environment"
                value={ENVIRONMENT_LABELS[overviewQ.data.environment]}
              />
              <CompactMetric label="AI Provider" value={overviewQ.data.ai.provider} />
              <CompactMetric label="AI Model" value={overviewQ.data.ai.model} />
            </div>

            <PremiumCard className={cn(CONTROL_SURFACE, "p-3.5")}>
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold">{overviewQ.data.ai.model}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {overviewQ.data.ai.provider} · {overviewQ.data.advisorVersions.length} advisor
                    configs
                  </p>
                </div>
                <StatusChip
                  tone={
                    overviewQ.data.ai.provider === "invalid"
                      ? "error"
                      : overviewQ.data.ai.configured
                        ? "active"
                        : "neutral"
                  }
                >
                  {overviewQ.data.ai.provider === "invalid"
                    ? "תקלה"
                    : overviewQ.data.ai.configured
                      ? "פעיל"
                      : "לא מוגדר"}
                </StatusChip>
              </div>
              <dl className="mt-3 grid grid-cols-3 divide-x divide-x-reverse divide-border/60 border-t border-border/60 pt-2.5 text-center">
                <div>
                  <dt className="text-[9px] text-muted-foreground">Output limit</dt>
                  <dd className="mt-0.5 text-xs font-bold tabular-nums">
                    {overviewQ.data.ai.maxOutputTokens}
                  </dd>
                </div>
                <div>
                  <dt className="text-[9px] text-muted-foreground">Timeout</dt>
                  <dd className="mt-0.5 text-xs font-bold tabular-nums">
                    {overviewQ.data.ai.timeoutMs / 1000}s
                  </dd>
                </div>
                <div>
                  <dt className="text-[9px] text-muted-foreground">Retries</dt>
                  <dd className="mt-0.5 text-xs font-bold tabular-nums">
                    {overviewQ.data.ai.maxRetries}
                  </dd>
                </div>
              </dl>
            </PremiumCard>
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          className="mb-2"
          title="תוכניות והרשאות"
          subtitle="Entitlements · QA preview"
        />
        <PlanControl
          authoritativePlan={planQ.data?.plan}
          authoritativeStatus={planQ.data?.status}
          isPending={planQ.isPending}
        />
      </section>

      <section>
        <SectionHeader
          className="mb-2"
          title="ספריית תרגילים ומדיה"
          subtitle="Core 150 · Exercise Media"
        />
        <div className="space-y-2.5">
          {registry ? (
            <Link to="/admin/exercise-registry" className="block">
              <PremiumCard
                className={cn(
                  CONTROL_SURFACE,
                  "border-primary/25 p-3.5 transition hover:border-primary/40 active:scale-[0.99]",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                    <Database className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold">רישום התרגילים</p>
                    <p className="text-[9px] font-medium text-foreground/45" dir="ltr">
                      Exercise Registry
                    </p>
                  </div>
                  <StatusChip tone="active">פעיל</StatusChip>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>

                <dl className="mt-3 grid grid-cols-4 divide-x divide-x-reverse divide-border/60 border-y border-border/60 py-2.5 text-center">
                  <div>
                    <dt className="text-[8px] text-muted-foreground">Core 150</dt>
                    <dd className="mt-0.5 text-sm font-bold tabular-nums">
                      {registry.totalExercises}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[8px] text-muted-foreground">הושלמו</dt>
                    <dd className="mt-0.5 text-sm font-bold tabular-nums">
                      {registry.completedExercises}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[8px] text-muted-foreground">חלקיים</dt>
                    <dd className="mt-0.5 text-sm font-bold tabular-nums">
                      {registry.partialExercises}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[8px] text-muted-foreground">לא התחילו</dt>
                    <dd className="mt-0.5 text-sm font-bold tabular-nums">
                      {registry.notStartedExercises}
                    </dd>
                  </div>
                </dl>

                <div className="mt-2.5 flex min-w-0 items-center justify-between gap-3 text-[10px]">
                  <p className="min-w-0 truncate text-muted-foreground">
                    {registry.nextRecommendedExercise
                      ? `הבא: #${registry.nextRecommendedExercise.exerciseNumber} · ${registry.nextRecommendedExercise.canonicalHebrewName}`
                      : "כל תרגילי Core 150 הושלמו"}
                  </p>
                  <p className="shrink-0 text-foreground/55" dir="ltr">
                    {registry.coversComplete} Covers · {registry.infographicsComplete} Infographics
                  </p>
                </div>
              </PremiumCard>
            </Link>
          ) : (
            <PremiumCard className={cn(CONTROL_SURFACE, "p-3 text-xs text-muted-foreground")}>
              {registryQ.isPending ? "טוען Registry חי…" : "נתוני Registry אינם זמינים כרגע."}
            </PremiumCard>
          )}

          <div className="rounded-2xl border border-border/70 bg-card/65 p-3 shadow-sm">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-bold">מדיה</p>
                <p className="text-[9px] font-medium text-foreground/45" dir="ltr">
                  Media Inbox · העלאה ושיוך נכסים
                </p>
              </div>
              <StatusChip tone="active">פעיל</StatusChip>
            </div>
            <MediaInboxCard showHeader={false} compact />
          </div>
        </div>
      </section>

      <section>
        <SectionHeader className="mb-2" title="QA ואבחון" subtitle="Internal diagnostics" />
        <div className="space-y-1.5">
          <CompactRow
            icon={FlaskConical}
            title="קונסולת מפתחים"
            technicalLabel="Developer Console"
            description="נכסי דמויות וכלי פיתוח"
            active={devConsoleEnabled}
            {...(devConsoleEnabled
              ? { to: "/dev" as const }
              : { status: { label: "לא פעיל", tone: "neutral" as const } })}
          />
          <CompactRow
            icon={Activity}
            title="בריאות המערכת"
            technicalLabel="System Health"
            description="בדיקות מערכת מרכזיות"
            status={{ label: "בקרוב", tone: "future" }}
          />
          <CompactRow
            icon={Gauge}
            title="דגלי תכונות"
            technicalLabel="Feature Flags"
            description={`Dev Console: ${devConsoleEnabled ? "Enabled" : "Disabled"}`}
            status={{ label: "קריאה בלבד", tone: "readOnly" }}
          />
        </div>
      </section>

      <section>
        <SectionHeader className="mb-2" title="משתמשים והרשאות" subtitle="Users & Roles" />
        <CompactRow
          icon={Users}
          title="משתמשים ותפקידים"
          technicalLabel="Users & Roles"
          description="ניהול הרשאות מאובטח"
          status={{ label: "בקרוב", tone: "future" }}
        />
      </section>
    </div>
  );
}
