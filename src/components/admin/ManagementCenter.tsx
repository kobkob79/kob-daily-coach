import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronLeft,
  Database,
  Dumbbell,
  FlaskConical,
  FolderUp,
  Gauge,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { BuildInfo } from "@/components/BuildInfo";
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

function StatusPill({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
        ready
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border/60 bg-muted/30 text-muted-foreground",
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", ready ? "bg-primary" : "bg-muted-foreground")}
      />
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/35 px-3 py-3">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}

function ManagementLink({
  icon: Icon,
  title,
  description,
  to,
  state,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  to?: "/admin/exercise-registry" | "/dev";
  state?: string;
}) {
  const content = (
    <PremiumCard
      className={cn(
        "flex min-h-[76px] items-center gap-3 p-4",
        to && "transition hover:border-primary/35 active:scale-[0.99]",
      )}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      {state ? (
        <span className="shrink-0 rounded-full border border-border/50 px-2 py-1 text-[10px] text-muted-foreground">
          {state}
        </span>
      ) : (
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </PremiumCard>
  );

  return to ? <Link to={to}>{content}</Link> : content;
}

function PlanSimulator() {
  const { hydrated, plan, setPlan } = useVioraPlanUI();

  const selectPlan = (next: VioraPlan) => {
    if (hydrated) setPlan(next);
  };

  return (
    <PremiumCard className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold">תצוגת תוכנית מקומית</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            כלי QA לתצוגת Free/Premium במכשיר הזה בלבד
          </p>
        </div>
        <StatusPill ready={hydrated}>{hydrated ? plan.toUpperCase() : "טוען"}</StatusPill>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border/50 bg-muted/20 p-1">
        {(["free", "premium"] as const).map((option) => (
          <button
            key={option}
            type="button"
            disabled={!hydrated}
            onClick={() => selectPlan(option)}
            className={cn(
              "min-h-11 rounded-xl text-xs font-bold transition disabled:opacity-50",
              plan === option
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-card/70",
            )}
          >
            {option === "free" ? "Free" : "Premium"}
          </button>
        ))}
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
    <div className="space-y-6 pb-[env(safe-area-inset-bottom)]" dir="rtl">
      <header className="space-y-3">
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
            <p className="mt-0.5 text-xs text-muted-foreground">מרכז הניהול והבקרה של Viora</p>
          </div>
          <ShieldCheck className="h-6 w-6 shrink-0 text-primary" aria-hidden />
        </div>
        <div className="flex flex-wrap items-center gap-2 pr-[52px]">
          <StatusPill ready>Admin</StatusPill>
          <BuildInfo />
        </div>
      </header>

      <section>
        <SectionHeader title="מצב המערכת" subtitle="מידע חי וקונפיגורציה בטוחה" />
        {overviewQ.isPending ? (
          <PremiumCard className="grid min-h-28 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </PremiumCard>
        ) : overviewQ.isError || !overviewQ.data ? (
          <PremiumCard className="space-y-3">
            <p className="text-sm font-semibold">מצב המערכת אינו זמין כרגע</p>
            <Button variant="outline" size="sm" onClick={() => void overviewQ.refetch()}>
              <RefreshCw className="ml-2 h-4 w-4" /> ניסיון נוסף
            </Button>
          </PremiumCard>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Environment" value={ENVIRONMENT_LABELS[overviewQ.data.environment]} />
            <Metric label="Role" value={overviewQ.data.role} />
            <Metric label="AI Provider" value={overviewQ.data.ai.provider} />
            <Metric label="AI Model" value={overviewQ.data.ai.model} />
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="AI וספקים" subtitle="קונפיגורציית Advisor AI הפעילה" />
        <PremiumCard className="space-y-4">
          {overviewQ.data ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Bot className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{overviewQ.data.ai.model}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {overviewQ.data.ai.provider} · {overviewQ.data.ai.maxOutputTokens} output
                      tokens
                    </p>
                  </div>
                </div>
                <StatusPill ready={overviewQ.data.ai.configured}>
                  {overviewQ.data.ai.configured ? "מוגדר" : "לא מוגדר"}
                </StatusPill>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Timeout" value={`${overviewQ.data.ai.timeoutMs / 1000}s`} />
                <Metric label="Retries" value={overviewQ.data.ai.maxRetries} />
              </div>
              <div className="border-t border-border/50 pt-3">
                <p className="text-[10px] text-muted-foreground">Advisor versions</p>
                <div className="mt-2 flex flex-wrap gap-1.5" dir="ltr">
                  {overviewQ.data.advisorVersions.map((version) => (
                    <span
                      key={version}
                      className="rounded-full border border-border/50 px-2 py-1 font-mono text-[9px] text-muted-foreground"
                    >
                      {version}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">הקונפיגורציה אינה זמינה כרגע.</p>
          )}
        </PremiumCard>
      </section>

      <section>
        <SectionHeader title="תוכניות והרשאות" subtitle="Entitlement אמיתי וכלי תצוגה ל־QA" />
        <div className="space-y-2">
          <PremiumCard className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">התוכנית של החשבון הנוכחי</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {planQ.isPending
                  ? "טוען entitlement…"
                  : planQ.data
                    ? `${planQ.data.plan.toUpperCase()} · ${planQ.data.status}`
                    : "לא זמין כרגע"}
              </p>
            </div>
            <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
          </PremiumCard>
          <PlanSimulator />
        </div>
      </section>

      <section>
        <SectionHeader title="ספריית תרגילים ומדיה" subtitle="Core 150 וניהול נכסים" />
        <div className="space-y-2">
          {registry ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Core 150" value={registry.totalExercises} />
              <Metric label="הושלמו" value={registry.completedExercises} />
              <Metric label="חלקיים" value={registry.partialExercises} />
              <Metric label="לא התחילו" value={registry.notStartedExercises} />
            </div>
          ) : (
            <PremiumCard className="text-xs text-muted-foreground">
              {registryQ.isPending ? "טוען Registry חי…" : "נתוני Registry אינם זמינים כרגע."}
            </PremiumCard>
          )}
          <ManagementLink
            icon={Database}
            title="Exercise Registry"
            description={
              registry?.nextRecommendedExercise
                ? `הבא: #${registry.nextRecommendedExercise.exerciseNumber} · ${registry.nextRecommendedExercise.canonicalHebrewName}`
                : "תמונת מצב חיה, אבחון וסינון Core 150"
            }
            to="/admin/exercise-registry"
          />
          <ManagementLink
            icon={Dumbbell}
            title="מדדי מדיה"
            description={
              registry
                ? `${registry.coversComplete} Covers · ${registry.infographicsComplete} Infographics`
                : "ממתין לנתוני Registry"
            }
            state={registry ? "Live" : "לא זמין"}
          />
        </div>
      </section>

      <section>
        <SectionHeader title="QA ואבחון" subtitle="כלים פנימיים ללא חשיפת secrets" />
        <div className="space-y-2">
          <ManagementLink
            icon={FlaskConical}
            title="קונסולת מפתחים"
            description="נכסי דמויות וכלי פיתוח קיימים"
            {...(devConsoleEnabled ? { to: "/dev" as const } : { state: "לא פעיל" })}
          />
          <ManagementLink
            icon={Activity}
            title="System Health"
            description="איסוף health checks מרכזי עדיין לא הוגדר"
            state="Coming next"
          />
          <ManagementLink
            icon={Gauge}
            title="Feature Flags"
            description={`Dev Console: ${devConsoleEnabled ? "Enabled" : "Disabled"}`}
            state="Read only"
          />
        </div>
      </section>

      <section>
        <SectionHeader title="משתמשים ותפקידים" subtitle="מקור הרשאה: user_roles" />
        <ManagementLink
          icon={Users}
          title="Users & Roles"
          description="ניהול משתמשים ותפקידים מאובטח עדיין לא הוגדר"
          state="Coming next"
        />
      </section>

      <section>
        <SectionHeader title="Media Inbox" subtitle="העלאה ושיוך דרך ה־workflow המוגן הקיים" />
        <MediaInboxCard />
      </section>

      <PremiumCard className="flex items-center gap-3 border-primary/20 bg-primary/5">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-xs font-semibold">Admin authorization פעיל</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            כל מסלולי /admin יורשים את בדיקת ההרשאה בצד השרת.
          </p>
        </div>
      </PremiumCard>
    </div>
  );
}
