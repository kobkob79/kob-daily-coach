/**
 * Water Goal card — colorful blue wave meter with quick-add buttons.
 * Every tap inserts a `daily_events` row (kind=water) so it appears in the
 * chronological timeline and feeds the intelligence engine.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Droplet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import { biologicalDay } from "@/lib/meals";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PRESETS = [250, 500, 750];

export function WaterGoal({
  consumedMl,
  targetMl,
}: {
  consumedMl: number;
  targetMl: number;
}) {
  const qc = useQueryClient();
  const bioDay = biologicalDay(new Date());
  const pct = Math.min(1, targetMl > 0 ? consumedMl / targetMl : 0);
  const pctRounded = Math.round(pct * 100);
  const consumedL = (consumedMl / 1000).toFixed(1);
  const targetL = (targetMl / 1000).toFixed(1);

  const addWater = useMutation({
    mutationFn: async (amount: number) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("no user");
      const { error } = await supabase.from("daily_events").insert({
        user_id: u.user.id,
        kind: "water",
        event_date: format(new Date(), "yyyy-MM-dd"),
        biological_day: bioDay,
        amount,
        unit: "מ״ל",
        emoji: "💧",
      });
      if (error) throw error;
    },
    onSuccess: (_d, amount) => {
      toast.success(`💧 ${amount} מ״ל נרשמו`);
      qc.invalidateQueries({ queryKey: ["daily-events", bioDay] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Wave height as a % of the container (from the bottom).
  const waveHeight = Math.max(6, Math.round(pct * 100));

  return (
    <section>
      <SectionHeader title={t("water.title")} subtitle={t("water.subtitle")} />
      <PremiumCard className="relative overflow-hidden border-sky-500/30">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            background:
              "radial-gradient(circle at 20% 10%, hsl(200 90% 55% / 0.35), transparent 60%), radial-gradient(circle at 80% 90%, hsl(190 80% 50% / 0.3), transparent 55%)",
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-5">
          {/* Wave meter */}
          <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full ring-2 ring-sky-400/40 bg-sky-950/40">
            <div
              className="absolute inset-x-0 bottom-0 transition-all duration-700 ease-out"
              style={{ height: `${waveHeight}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-sky-500 via-sky-400 to-cyan-300" />
              {/* Wavey top edge */}
              <svg
                viewBox="0 0 120 20"
                preserveAspectRatio="none"
                className="absolute -top-3 left-0 h-4 w-full"
                aria-hidden
              >
                <path
                  d="M0 10 Q 15 0 30 10 T 60 10 T 90 10 T 120 10 V20 H0 Z"
                  fill="hsl(200 90% 55%)"
                />
              </svg>
            </div>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="text-xl font-bold tabular-nums text-white drop-shadow">
                  {pctRounded}%
                </p>
                <Droplet className="mx-auto mt-0.5 h-3.5 w-3.5 text-white/80" />
              </div>
            </div>
          </div>

          {/* Numbers + presets */}
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold tracking-tight tabular-nums">
              <span className="text-sky-400">{consumedL}</span>
              <span className="text-muted-foreground"> / {targetL} </span>
              <span className="text-sm font-medium text-muted-foreground">
                {t("water.liters")}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("water.remaining")}:{" "}
              <b className="text-foreground">
                {Math.max(0, targetMl - consumedMl)} {t("water.ml")}
              </b>
            </p>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {PRESETS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  disabled={addWater.isPending}
                  onClick={() => addWater.mutate(amt)}
                  className={cn(
                    "rounded-2xl border border-sky-400/40 bg-sky-500/10 px-2 py-2 text-center transition",
                    "hover:bg-sky-500/20 hover:border-sky-400/70 active:scale-95",
                    "disabled:opacity-50",
                  )}
                >
                  <div className="text-[10px] text-sky-300">+</div>
                  <div className="text-sm font-bold tabular-nums text-sky-100">
                    {amt}
                  </div>
                  <div className="text-[9px] text-sky-300/80">{t("water.ml")}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </PremiumCard>
    </section>
  );
}
