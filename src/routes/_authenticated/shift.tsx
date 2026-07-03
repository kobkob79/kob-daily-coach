import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { getShiftRange, SHIFT_STYLES, type ShiftConfig } from "@/lib/shift";
import { addDays, startOfWeek, format } from "date-fns";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/shift")({
  component: ShiftPage,
});

function ShiftPage() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));

  const cfgQ = useQuery({
    queryKey: ["shift-config"],
    queryFn: async () => {
      const { data } = await supabase.from("shift_config").select("*").maybeSingle();
      return data as ShiftConfig | null;
    },
  });

  const [anchorDate, setAnchorDate] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) throw new Error("Not signed in");
      const finalAnchor = anchorDate || cfgQ.data?.anchor_date;
      if (!finalAnchor) throw new Error(t("shift.firstDay"));
      const { error } = await supabase.from("shift_config").upsert({
        user_id: userRes.user.id,
        anchor_date: finalAnchor,
        anchor_shift: "day", // ignored by intel_9d, kept for column compatibility
        pattern: "intel_9d",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift-config"] });
      toast.success(t("shift.saved"));
    },
    onError: (e) => toast.error(e.message),
  });

  const cfg = cfgQ.data;
  const days = cfg ? getShiftRange(cfg, weekStart, 28) : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("shift.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("shift.subtitle")}</p>
      </div>

      <div className="surface-card space-y-3 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {cfg ? t("shift.update") : t("shift.set")}
        </h3>
        <div>
          <Label>{t("shift.firstDay")}</Label>
          <Input type="date" value={anchorDate || cfg?.anchor_date || ""} onChange={(e) => setAnchorDate(e.target.value)} />
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || (!anchorDate && !cfg?.anchor_date)} className="w-full">
          {t("shift.save")}
        </Button>
        <p className="text-[11px] text-muted-foreground">{t("shift.pattern")}</p>
      </div>

      {cfg && (
        <>
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </Button>
            <span className="text-sm font-medium">
              {format(weekStart, "d MMM")} – {format(addDays(weekStart, 27), "d MMM")}
            </span>
            <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {["ב","ג","ד","ה","ו","ש","א"].map((d, i) => (
              <div key={i} className="text-center text-[10px] uppercase tracking-wider text-muted-foreground pb-1">{d}</div>
            ))}
            {days.map((d) => {
              const style = SHIFT_STYLES[d.shift];
              const isToday = format(new Date(), "yyyy-MM-dd") === d.iso;
              return (
                <div
                  key={d.iso}
                  className={`aspect-square rounded-lg border p-1.5 flex flex-col justify-between text-[10px] ${style.className} ${isToday ? "ring-2 ring-primary" : ""}`}
                >
                  <span className="font-bold text-sm">{format(d.date, "d")}</span>
                  <span className="uppercase tracking-wider opacity-80 truncate">{t(`shift.short.${d.shift}`)}</span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap justify-center gap-3 text-xs">
            {(["day","night","half_rest","off"] as const).map((k) => (
              <div key={k} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${SHIFT_STYLES[k].dot}`} />
                <span>{t(`shift.legend.${k}`)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
