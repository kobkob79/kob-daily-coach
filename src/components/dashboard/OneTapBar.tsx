/**
 * One-touch quick-add strip for the Home screen.
 * - Favorites (from meal_favorites) → insert nutrition entry.
 * - Water buttons (250 / 500 ml) → insert daily_events row.
 * - Supplement / Weight / Sleep → prompt() capture, insert daily_events.
 *
 * Uses native prompt() for weight/sleep to keep the UI unchanged.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { PremiumCard, SectionHeader } from "@/components/ui-kit/Section";
import {
  MEAL_TYPE_BY_LABEL,
  SEED_FAVORITES,
  biologicalDay,
  suggestMealType,
  type FoodItem,
} from "@/lib/meals";
import { useEffect } from "react";

interface Favorite {
  id: string;
  name: string;
  emoji: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  default_meal_type: string | null;
}

const WATER_PRESETS = [
  { emoji: "💧", amount: 250, label: "250" },
  { emoji: "💧", amount: 500, label: "500" },
];

export function OneTapBar() {
  const qc = useQueryClient();
  const bioDay = biologicalDay(new Date());

  const favoritesQ = useQuery({
    queryKey: ["meal-favorites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_favorites")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("use_count", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Favorite[];
    },
  });

  // Seed defaults on very first Home visit if user has none.
  useEffect(() => {
    if (favoritesQ.isSuccess && favoritesQ.data.length === 0) {
      (async () => {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const rows = SEED_FAVORITES.map((f, i) => ({ ...f, user_id: u.user!.id, sort_order: i }));
        await supabase.from("meal_favorites").insert(rows);
        qc.invalidateQueries({ queryKey: ["meal-favorites"] });
      })();
    }
  }, [favoritesQ.isSuccess, favoritesQ.data?.length, qc]);

  const invalidateTimeline = () => {
    qc.invalidateQueries({ queryKey: ["meals", bioDay] });
    qc.invalidateQueries({ queryKey: ["timeline"] });
    qc.invalidateQueries({ queryKey: ["nutrition", bioDay] });
    qc.invalidateQueries({ queryKey: ["daily-events", bioDay] });
  };

  const addFavorite = useMutation({
    mutationFn: async (fav: Favorite) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("no user");
      const now = new Date();
      const mt = MEAL_TYPE_BY_LABEL[fav.default_meal_type ?? ""] ?? suggestMealType(now);
      const foods: FoodItem[] = [{
        name: fav.name,
        calories: fav.calories ?? undefined,
        protein_g: fav.protein_g ?? undefined,
        carbs_g: fav.carbs_g ?? undefined,
        fat_g: fav.fat_g ?? undefined,
      }];
      const { error } = await supabase.from("nutrition_entries").insert({
        user_id: u.user.id,
        date: format(now, "yyyy-MM-dd"),
        biological_day: bioDay,
        meal_time: format(now, "HH:mm:ss"),
        meal: mt.enum,
        meal_type: mt.label,
        food_name: fav.name,
        foods: foods as unknown as never,
        calories: fav.calories,
        protein_g: fav.protein_g,
        carbs_g: fav.carbs_g,
        fat_g: fav.fat_g,
        source: "favorite",
      });
      if (error) throw error;
    },
    onSuccess: (_d, fav) => {
      toast.success(`${fav.emoji ?? "⭐"} ${fav.name} · ${t("meals.saved")}`);
      invalidateTimeline();
    },
    onError: (e) => toast.error(e.message),
  });

  const addEvent = useMutation({
    mutationFn: async (payload: {
      kind: "water" | "supplement" | "weight" | "sleep";
      amount?: number | null;
      unit?: string;
      label?: string;
      emoji?: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("no user");
      const { error } = await supabase.from("daily_events").insert({
        user_id: u.user.id,
        kind: payload.kind,
        event_date: format(new Date(), "yyyy-MM-dd"),
        biological_day: bioDay,
        amount: payload.amount ?? null,
        unit: payload.unit ?? null,
        label: payload.label ?? null,
        emoji: payload.emoji ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, p) => {
      toast.success(t(`quick.saved.${p.kind}`));
      invalidateTimeline();
    },
    onError: (e) => toast.error(e.message),
  });

  const promptSupplement = () => {
    const name = window.prompt(t("quick.prompt.supplement"), "");
    if (name && name.trim()) {
      addEvent.mutate({ kind: "supplement", label: name.trim(), emoji: "💊" });
    }
  };
  const promptWeight = () => {
    const v = window.prompt(t("quick.prompt.weight"), "");
    const n = v ? Number(v.replace(",", ".")) : NaN;
    if (!Number.isNaN(n) && n > 0) {
      addEvent.mutate({ kind: "weight", amount: n, unit: "ק״ג", emoji: "⚖" });
    }
  };
  const promptSleep = () => {
    const v = window.prompt(t("quick.prompt.sleep"), "");
    const n = v ? Number(v.replace(",", ".")) : NaN;
    if (!Number.isNaN(n) && n > 0 && n <= 24) {
      addEvent.mutate({ kind: "sleep", amount: n, unit: t("common.hours"), emoji: "😴" });
    }
  };

  const favorites = (favoritesQ.data ?? []).slice(0, 6);

  return (
    <section>
      <SectionHeader title={t("quick.title")} subtitle={t("quick.hint")} />
      <PremiumCard>
        {/* Water + system quick actions */}
        <div className="mb-3 grid grid-cols-5 gap-2">
          {WATER_PRESETS.map((w) => (
            <QuickBtn
              key={w.amount}
              emoji={w.emoji}
              label={`${w.label} מ״ל`}
              onClick={() => addEvent.mutate({ kind: "water", amount: w.amount, unit: "מ״ל", emoji: "💧" })}
            />
          ))}
          <QuickBtn emoji="💊" label={t("quick.supplement")} onClick={promptSupplement} />
          <QuickBtn emoji="⚖" label={t("quick.weight")} onClick={promptWeight} />
          <QuickBtn emoji="😴" label={t("quick.sleep")} onClick={promptSleep} />
        </div>

        {/* Favorite foods */}
        {favorites.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {favorites.map((f) => (
              <QuickBtn
                key={f.id}
                emoji={f.emoji ?? "⭐"}
                label={f.name}
                sub={f.protein_g != null ? `P${Math.round(Number(f.protein_g))}` : undefined}
                onClick={() => addFavorite.mutate(f)}
              />
            ))}
          </div>
        )}
      </PremiumCard>
    </section>
  );
}

function QuickBtn({
  emoji, label, sub, onClick,
}: { emoji: string; label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 rounded-2xl border border-border/60 bg-card/70 p-2.5 text-center transition hover:border-primary/50 active:scale-95"
    >
      <span className="text-xl leading-none">{emoji}</span>
      <span className="text-[11px] font-medium leading-tight line-clamp-1">{label}</span>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </button>
  );
}
