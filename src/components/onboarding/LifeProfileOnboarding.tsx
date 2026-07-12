/**
 * Life Profile onboarding wizard.
 *
 * Full-screen overlay shown on first launch (and any time a user has no
 * `onboarding_completed_at`). Persists after every step so the flow is
 * fully resumable if the user closes the app mid-way.
 *
 * The wizard collects only the generic Life Profile fields — first name,
 * birth date, sex, height, weight, life context — plus the generic shift
 * cycle when the user identifies as a shift worker.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import {
  LIFE_CONTEXTS,
  ONBOARDING_STEPS,
  WORK_CONTEXTS,
  fetchLifeProfile,
  nextOnboardingStep,
  patchLifeProfile,
  saveShiftCycle,
  type LifeContext,
  type LifeProfile,
  type OnboardingStep,
  type Sex,
} from "@/lib/life-profile";
import { format } from "date-fns";

const SEXES: { key: Sex; labelKey: string }[] = [
  { key: "male",   labelKey: "profile.gender.male" },
  { key: "female", labelKey: "profile.gender.female" },
  { key: "other",  labelKey: "profile.gender.other" },
];

interface Props {
  initial: LifeProfile | null;
  onComplete: () => void;
}

export function LifeProfileOnboarding({ initial, onComplete }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<OnboardingStep>(() => nextOnboardingStep(initial));

  // Local draft mirrors persisted state so users can edit before advancing.
  const [firstName,  setFirstName]  = useState(initial?.first_name ?? "");
  const [birthDate,  setBirthDate]  = useState(initial?.birth_date ?? "");
  const [sex,        setSex]        = useState<Sex | "">(initial?.sex ?? "");
  const [heightCm,   setHeightCm]   = useState(initial?.height_cm?.toString() ?? "");
  const [weightKg,   setWeightKg]   = useState(initial?.weight_kg?.toString() ?? "");
  const [lifeCtx,    setLifeCtx]    = useState<LifeContext | "">(initial?.life_context ?? "");
  const [workplace,  setWorkplace]  = useState(initial?.workplace ?? "");
  const [jobTitle,   setJobTitle]   = useState(initial?.job_title ?? "");
  const [cycleLen,   setCycleLen]   = useState(initial?.shift_cycle?.cycle_length?.toString() ?? "");
  const [dayShifts,  setDayShifts]  = useState(initial?.shift_cycle?.day_shifts?.toString() ?? "");
  const [nightShifts,setNightShifts]= useState(initial?.shift_cycle?.night_shifts?.toString() ?? "");
  const [offDays,    setOffDays]    = useState(initial?.shift_cycle?.off_days?.toString() ?? "");
  const [cycleStartMode, setCycleStartMode] = useState<"today" | "pick">(
    initial?.shift_cycle?.anchor_date ? "pick" : "today",
  );
  const [cycleStartDate, setCycleStartDate] = useState(
    initial?.shift_cycle?.anchor_date ?? format(new Date(), "yyyy-MM-dd"),
  );

  // Which steps actually apply for the current life context, in order.
  const flow = useMemo<OnboardingStep[]>(() => {
    const base: OnboardingStep[] = ["first_name","birth_date","sex","height","weight","life_context"];
    if (lifeCtx && WORK_CONTEXTS.includes(lifeCtx as LifeContext)) base.push("work_details");
    if (lifeCtx === "shift_worker") base.push("shift_cycle");
    base.push("done");
    return base;
  }, [lifeCtx]);

  const totalSteps = flow.length - 1; // exclude "done"
  const currentIndex = Math.max(0, flow.indexOf(step));
  const progress = Math.min(1, (currentIndex + 1) / totalSteps);

  const persistStep = useMutation({
    mutationFn: async (next: OnboardingStep) => {
      // Persist only what the current step owns.
      const nextIndex = ONBOARDING_STEPS.indexOf(next);
      const patch: Parameters<typeof patchLifeProfile>[0] = {
        onboarding_step: nextIndex,
      };
      if (step === "first_name")  patch.first_name  = firstName.trim() || null;
      if (step === "birth_date")  patch.birth_date  = birthDate || null;
      if (step === "sex")         patch.sex         = sex || null;
      if (step === "height")      patch.height_cm   = heightCm ? Number(heightCm) : null;
      if (step === "weight")      patch.weight_kg   = weightKg ? Number(weightKg) : null;
      if (step === "life_context") patch.life_context = (lifeCtx as LifeContext) || null;
      if (step === "work_details") {
        patch.workplace = workplace.trim() || null;
        patch.job_title = jobTitle.trim() || null;
      }

      if (step === "shift_cycle") {
        const anchor = cycleStartMode === "today"
          ? format(new Date(), "yyyy-MM-dd")
          : (cycleStartDate || format(new Date(), "yyyy-MM-dd"));
        await saveShiftCycle({
          cycle_length: Math.max(1, Number(cycleLen) || 0),
          day_shifts:   Math.max(0, Number(dayShifts) || 0),
          night_shifts: Math.max(0, Number(nightShifts) || 0),
          off_days:     Math.max(0, Number(offDays) || 0),
          anchor_date:  anchor,
        });
      }

      if (next === "done") patch.onboarding_completed_at = new Date().toISOString();
      await patchLifeProfile(patch);
    },
    onSuccess: (_d, next) => {
      qc.invalidateQueries({ queryKey: ["life-profile"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["shift-config"] });
      qc.invalidateQueries({ queryKey: ["day-context"] });
      if (next === "done") onComplete();
      else setStep(next);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const canAdvance = (() => {
    switch (step) {
      case "first_name":   return firstName.trim().length > 0;
      case "birth_date":   return !!birthDate;
      case "sex":          return !!sex;
      case "height":       return Number(heightCm) > 0;
      case "weight":       return Number(weightKg) > 0;
      case "life_context": return !!lifeCtx;
      case "work_details": return true; // both fields optional
      case "shift_cycle": {
        const c = Number(cycleLen), d = Number(dayShifts), n = Number(nightShifts), o = Number(offDays);
        const anchorOk = cycleStartMode === "today" || !!cycleStartDate;
        return c > 0 && d + n + o === c && anchorOk;
      }
      default: return true;
    }
  })();

  const nextStep = (): OnboardingStep => {
    const i = flow.indexOf(step);
    return flow[Math.min(flow.length - 1, i + 1)];
  };
  const prevStep = (): OnboardingStep | null => {
    const i = flow.indexOf(step);
    return i > 0 ? flow[i - 1] : null;
  };

  const title = t(`onboarding.step.${step}.title`);
  const hint  = t(`onboarding.step.${step}.hint`);

  // On mount, correct the step if the persisted state has moved on.
  useEffect(() => {
    const derived = nextOnboardingStep(initial);
    if (derived !== step) setStep(derived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background/95 backdrop-blur-md animate-fade-in">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6 pt-safe">
        {/* Progress */}
        <div className="pt-6">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {t("onboarding.stepIndicator")
              .replace("{n}", String(currentIndex + 1))
              .replace("{total}", String(totalSteps))}
          </p>
        </div>

        {/* Heading */}
        <div className="mt-8">
          <h1 className="text-2xl font-bold leading-tight">{title}</h1>
          {hint && <p className="mt-2 text-sm text-muted-foreground">{hint}</p>}
        </div>

        {/* Field */}
        <div className="mt-6 flex-1">
          {step === "first_name" && (
            <Field label={t("onboarding.field.firstName")}>
              <Input
                autoFocus
                dir="rtl"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t("onboarding.field.firstNamePh")}
              />
            </Field>
          )}
          {step === "birth_date" && (
            <Field label={t("onboarding.field.birthDate")}>
              <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            </Field>
          )}
          {step === "sex" && (
            <PillGroup
              value={sex}
              options={SEXES.map((s) => ({ value: s.key, label: t(s.labelKey) }))}
              onChange={(v) => setSex(v as Sex)}
            />
          )}
          {step === "height" && (
            <Field label={t("onboarding.field.height")}>
              <Input
                autoFocus
                type="number"
                inputMode="numeric"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="175"
              />
            </Field>
          )}
          {step === "weight" && (
            <Field label={t("onboarding.field.weight")}>
              <Input
                autoFocus
                type="number"
                inputMode="decimal"
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="75"
              />
            </Field>
          )}
          {step === "life_context" && (
            <PillGroup
              value={lifeCtx}
              options={LIFE_CONTEXTS.map((c) => ({ value: c.key, label: t(c.labelKey) }))}
              onChange={(v) => setLifeCtx(v as LifeContext)}
              stacked
            />
          )}
          {step === "work_details" && (
            <div className="space-y-3">
              <Field label={t("onboarding.field.workplace")}>
                <Input dir="rtl" value={workplace}
                  onChange={(e) => setWorkplace(e.target.value)}
                  placeholder={t("onboarding.field.workplacePh")} />
              </Field>
              <Field label={t("onboarding.field.jobTitle")}>
                <Input dir="rtl" value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder={t("onboarding.field.jobTitlePh")} />
              </Field>
              <p className="text-[11px] text-muted-foreground">
                {t("onboarding.field.workOptional")}
              </p>
            </div>
          )}
          {step === "shift_cycle" && (
            <div className="space-y-3">
              <Field label={t("onboarding.field.cycleLength")}>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={cycleLen}
                  onChange={(e) => setCycleLen(e.target.value)}
                  placeholder="8"
                />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label={t("onboarding.field.dayShifts")}>
                  <Input type="number" inputMode="numeric" value={dayShifts}
                    onChange={(e) => setDayShifts(e.target.value)} placeholder="2" />
                </Field>
                <Field label={t("onboarding.field.nightShifts")}>
                  <Input type="number" inputMode="numeric" value={nightShifts}
                    onChange={(e) => setNightShifts(e.target.value)} placeholder="2" />
                </Field>
                <Field label={t("onboarding.field.offDays")}>
                  <Input type="number" inputMode="numeric" value={offDays}
                    onChange={(e) => setOffDays(e.target.value)} placeholder="4" />
                </Field>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("onboarding.field.cycleSumHint")}
              </p>

              <div className="pt-2">
                <p className="mb-2 text-xs text-muted-foreground">{t("onboarding.field.cycleStart")}</p>
                <PillGroup
                  value={cycleStartMode}
                  onChange={(v) => setCycleStartMode(v as "today" | "pick")}
                  options={[
                    { value: "today", label: t("onboarding.field.cycleStartToday") },
                    { value: "pick",  label: t("onboarding.field.cycleStartPick") },
                  ]}
                />
                {cycleStartMode === "pick" && (
                  <div className="mt-2">
                    <Input type="date" value={cycleStartDate}
                      onChange={(e) => setCycleStartDate(e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <div className="mt-4 flex items-center justify-between gap-3">
          {prevStep() ? (
            <button
              type="button"
              onClick={() => setStep(prevStep()!)}
              className="grid h-11 w-11 place-items-center rounded-full border border-border/60 text-muted-foreground hover:text-foreground"
              aria-label={t("action.back")}
            >
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </button>
          ) : (
            <div />
          )}
          <Button
            onClick={() => persistStep.mutate(nextStep())}
            disabled={!canAdvance || persistStep.isPending}
            className="h-11 flex-1 rounded-full text-base"
          >
            {nextStep() === "done" ? t("onboarding.finish") : t("action.continue")}
            <ChevronLeft className="mr-1 h-4 w-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function PillGroup({
  value, options, onChange, stacked,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  stacked?: boolean;
}) {
  return (
    <div className={cn("flex gap-2", stacked ? "flex-col" : "flex-wrap")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm font-medium transition text-right",
            stacked ? "w-full" : "",
            value === o.value
              ? "border-primary bg-primary/15 text-primary"
              : "border-border/60 text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
