/**
 * QAToolsCard — the tester-only "כלי בדיקה" card that surfaces the
 * dangerous reset/simulation actions in one place. Rendered only when
 * `checkIsQAUser()` returns true (project owner/tester email or DEV).
 *
 * Every destructive action shows a confirmation dialog.
 * Every mutation is scoped to the currently authenticated user_id
 * (see src/lib/qa.ts).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import { t } from "@/lib/i18n";
import {
  checkIsQAUser,
  resetTodayData,
  resetFirstLaunchVideo,
  resetFullQAAccount,
  seedDemoDay,
} from "@/lib/qa";
import { resetOnboarding, resetLifeProfile } from "@/lib/life-profile";
import {
  getDayOverride,
  setDayOverride,
  clearDayOverride,
  type DayKind,
} from "@/lib/day-context";

export function QAToolsCard() {
  const qaQ = useQuery({ queryKey: ["qa-user"], queryFn: checkIsQAUser });
  if (!qaQ.data) return null;
  return <QAToolsBody />;
}

function QAToolsBody() {
  const qc = useQueryClient();
  const [override, setOverrideState] = useState<DayKind | null>(() => getDayOverride());

  const invalidateAll = () => {
    qc.invalidateQueries();
  };

  const run = (label: string, fn: () => Promise<void>) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        toast.success(`${label} · ${t("dev.done")}`);
        invalidateAll();
      },
      onError: (e) => toast.error((e as Error).message),
    });

  const mResetOnb = run(t("qa.resetOnboarding"), resetOnboarding);
  const mResetProfile = run(t("qa.resetLifeProfile"), resetLifeProfile);
  const mResetToday = run(t("qa.resetToday"), resetTodayData);
  const mResetVideo = run(t("qa.resetVideo"), resetFirstLaunchVideo);
  const mSeed = run(t("qa.seedDemo"), seedDemoDay);
  const mFullReset = run(t("qa.fullReset"), resetFullQAAccount);

  const applyOverride = (k: DayKind | null) => {
    if (k) setDayOverride(k);
    else clearDayOverride();
    setOverrideState(k);
    invalidateAll();
  };

  const confirmAnd = (label: string, fn: () => void) => {
    if (window.confirm(`${label}\n\n${t("qa.confirm")}`)) fn();
  };

  return (
    <PremiumCard className="space-y-4 border-warning/40">
      <SectionHeader
        title={t("qa.title")}
        subtitle={t("qa.subtitle")}
        action={
          <span className="rounded-full border border-warning/50 bg-warning/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-warning">
            QA
          </span>
        }
      />

      {/* Resets */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">{t("qa.section.reset")}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline"
            onClick={() => confirmAnd(t("qa.resetOnboarding"), () => mResetOnb.mutate())}>
            {t("qa.resetOnboarding")}
          </Button>
          <Button size="sm" variant="outline"
            onClick={() => confirmAnd(t("qa.resetLifeProfile"), () => mResetProfile.mutate())}>
            {t("qa.resetLifeProfile")}
          </Button>
          <Button size="sm" variant="outline"
            onClick={() => confirmAnd(t("qa.resetToday"), () => mResetToday.mutate())}>
            {t("qa.resetToday")}
          </Button>
          <Button size="sm" variant="outline"
            onClick={() => confirmAnd(t("qa.resetVideo"), () => mResetVideo.mutate())}>
            {t("qa.resetVideo")}
          </Button>
        </div>
      </div>

      {/* Simulate */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">{t("qa.section.simulate")}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={override === "day" ? "default" : "outline"}
            onClick={() => applyOverride("day")}>{t("qa.simDay")}</Button>
          <Button size="sm" variant={override === "night" ? "default" : "outline"}
            onClick={() => applyOverride("night")}>{t("qa.simNight")}</Button>
          <Button size="sm" variant={override === "off" ? "default" : "outline"}
            onClick={() => applyOverride("off")}>{t("qa.simOff")}</Button>
          <Button size="sm" variant="ghost"
            onClick={() => applyOverride(null)}>{t("qa.clearSim")}</Button>
        </div>
        {override && (
          <p className="text-[11px] text-warning">
            {t("qa.overrideActive").replace("{kind}", override)}
          </p>
        )}
      </div>

      {/* Demo + danger */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">{t("qa.section.data")}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline"
            onClick={() => confirmAnd(t("qa.seedDemo"), () => mSeed.mutate())}>
            {t("qa.seedDemo")}
          </Button>
          <Button size="sm" variant="destructive"
            onClick={() => confirmAnd(t("qa.fullResetWarn"), () => mFullReset.mutate())}>
            {t("qa.fullReset")}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("qa.fullResetHint")}</p>
      </div>
    </PremiumCard>
  );
}
