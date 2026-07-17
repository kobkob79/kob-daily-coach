import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Camera, Star, Pencil, Plus, X, Trash2, MapPin, Clock,
  UtensilsCrossed, Image as ImageIcon, Sparkles, Heart, ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { PremiumCard, SectionHeader, EmptyState } from "@/components/ui-kit/Section";
import { cn } from "@/lib/utils";
import {
  MEAL_TYPES, LOCATIONS, SEED_FAVORITES, biologicalDay, suggestMealType,
  MEAL_TYPE_BY_LABEL,
  type MealTypeDef, type LocationDef, type FoodItem, type SeedFavorite,
} from "@/lib/meals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/meals")({
  component: MealsPage,
});

type Meal = {
  id: string;
  date: string;
  meal_time: string | null;
  biological_day: string | null;
  meal_type: string | null;
  meal: string;
  location: string | null;
  food_name: string;
  foods: FoodItem[] | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  notes: string | null;
  photo_url: string | null;
};

type Favorite = {
  id: string;
  name: string;
  emoji: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  default_meal_type: string | null;
  sort_order: number;
};

function MealsPage() {
  const qc = useQueryClient();
  const bioDay = biologicalDay(new Date());

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"manual" | "photo" | "favorite">("manual");
  const [editingId, setEditingId] = useState<string | null>(null);

  const mealsQ = useQuery({
    queryKey: ["meals", bioDay],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_entries")
        .select("*")
        .eq("biological_day", bioDay)
        .order("meal_time", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Meal[];
    },
  });

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

  // Seed favorites on first visit if empty
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

  // Signed URLs for photos
  const photoPaths = (mealsQ.data ?? []).map((m) => m.photo_url).filter(Boolean) as string[];
  const photoQueries = useQueries({
    queries: photoPaths.map((p) => ({
      queryKey: ["meal-photo", p],
      queryFn: async () => {
        const { data } = await supabase.storage.from("meal-photos").createSignedUrl(p, 3600);
        return data?.signedUrl ?? null;
      },
      staleTime: 60 * 50 * 1000,
    })),
  });
  const photoMap = new Map<string, string | null>();
  photoPaths.forEach((p, i) => photoMap.set(p, photoQueries[i]?.data ?? null));

  const remove = useMutation({
    mutationFn: async (m: Meal) => {
      if (m.photo_url) {
        await supabase.storage.from("meal-photos").remove([m.photo_url]);
      }
      const { error } = await supabase.from("nutrition_entries").delete().eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("meals.deleted"));
      qc.invalidateQueries({ queryKey: ["meals", bioDay] });
    },
  });

  const quickAddFavorite = useMutation({
    mutationFn: async (fav: Favorite) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("no user");
      const now = new Date();
      const mt =
        MEAL_TYPE_BY_LABEL[fav.default_meal_type ?? ""] ?? suggestMealType(now);
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
      await supabase.from("meal_favorites").update({ use_count: 0 }).eq("id", fav.id); // touch
    },
    onSuccess: (_d, fav) => {
      toast.success(`${fav.emoji ?? "⭐"} ${fav.name} · ${t("meals.saved")}`);
      qc.invalidateQueries({ queryKey: ["meals", bioDay] });
    },
    onError: (e) => toast.error(e.message),
  });

  const openSheet = (mode: typeof sheetMode) => {
    setSheetMode(mode);
    setEditingId(null);
    setSheetOpen(true);
  };

  const editMeal = (m: Meal) => {
    setEditingId(m.id);
    setSheetMode("manual");
    setSheetOpen(true);
  };

  const editingMeal = mealsQ.data?.find((m) => m.id === editingId) ?? null;

  return (
    <div className="space-y-6 pb-2">
      <section className="pt-2">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {format(new Date(), "EEEE · d MMMM")}
        </p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight">
          <span className="gradient-text">{t("meals.title")}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("meals.today")}</p>
      </section>

      {/* Smart add tiles */}
      <section className="grid grid-cols-3 gap-3">
        <SmartTile icon={Camera} label={t("meals.addPhoto")} onClick={() => openSheet("photo")} />
        <SmartTile icon={Star}   label={t("meals.addFavorite")} onClick={() => openSheet("favorite")} />
        <SmartTile icon={Pencil} label={t("meals.addManual")} onClick={() => openSheet("manual")} />
      </section>

      {/* Timeline */}
      <section>
        <SectionHeader title={t("meals.today")} />
        {mealsQ.isLoading ? (
          <PremiumCard><p className="text-sm text-muted-foreground">…</p></PremiumCard>
        ) : mealsQ.data && mealsQ.data.length > 0 ? (
          <div className="space-y-3">
            {mealsQ.data.map((m) => (
              <MealCard
                key={m.id}
                meal={m}
                photoUrl={m.photo_url ? photoMap.get(m.photo_url) ?? null : null}
                onDelete={() => remove.mutate(m)}
                onEdit={() => editMeal(m)}
              />
            ))}
          </div>
        ) : (
          <PremiumCard>
            <EmptyState
              icon={<UtensilsCrossed className="h-5 w-5" />}
              title={t("meals.empty")}
              hint={t("meals.emptyHint")}
            />
          </PremiumCard>
        )}
      </section>

      {/* Favorites */}
      <section>
        <SectionHeader title={t("meals.favorites")} subtitle={t("meals.favoritesHint")} />
        <div className="grid grid-cols-3 gap-2.5">
          {(favoritesQ.data ?? []).map((f) => (
            <button
              key={f.id}
              onClick={() => quickAddFavorite.mutate(f)}
              className="group flex flex-col items-center gap-1.5 rounded-2xl border border-border/60 bg-card/60 p-3 text-center transition hover:border-primary/50 active:scale-95"
            >
              <span className="text-2xl leading-none">{f.emoji ?? "⭐"}</span>
              <span className="text-xs font-medium leading-tight">{f.name}</span>
              {f.protein_g != null && (
                <span className="text-[10px] text-muted-foreground">P{Math.round(Number(f.protein_g))}</span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* AI teaser */}
      <PremiumCard className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "var(--gradient-hero)" }} />
        <div className="relative flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl" style={{ background: "var(--gradient-primary)" }}>
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold">{t("meals.aiSoon")}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t("meals.aiSoonHint")}</p>
          </div>
        </div>
      </PremiumCard>

      {/* Inline "add meal" card — replaces the previous floating "+" button.
          Opens the existing bottom sheet with all four entry modes visible. */}
      <button
        type="button"
        onClick={() => openSheet("manual")}
        className="glass-card w-full p-4 text-right transition active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Plus className="h-5 w-5" strokeWidth={2.4} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-tight">{t("meals.add")}</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              צילום · הזנה בקול · הוספה ידנית · מועדפים
            </p>
          </div>
          <ChevronLeft className="h-5 w-5 text-muted-foreground rtl:rotate-180" />
        </div>
      </button>

      {sheetOpen && (
        <AddMealSheet
          initialMode={sheetMode}
          editing={editingMeal}
          bioDay={bioDay}
          onClose={() => { setSheetOpen(false); setEditingId(null); }}
          onSaved={() => {
            setSheetOpen(false);
            setEditingId(null);
            qc.invalidateQueries({ queryKey: ["meals", bioDay] });
          }}
        />
      )}
    </div>
  );
}

/* ---------- Smart tile ---------- */
function SmartTile({
  icon: Icon, label, onClick,
}: { icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-border/60 bg-card/70 p-4 text-center transition hover:border-primary/50 hover:shadow-glow active:scale-95"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: "var(--gradient-primary)" }}>
        <Icon className="h-5 w-5 text-primary-foreground" />
      </span>
      <span className="text-xs font-semibold leading-tight">{label}</span>
    </button>
  );
}

/* ---------- Meal card ---------- */
function MealCard({
  meal, photoUrl, onDelete, onEdit,
}: {
  meal: Meal; photoUrl: string | null; onDelete: () => void; onEdit: () => void;
}) {
  const type = meal.meal_type
    ? MEAL_TYPE_BY_LABEL[meal.meal_type] ?? { emoji: "🍽️", label: meal.meal_type }
    : { emoji: "🍽️", label: meal.meal };
  const loc = LOCATIONS.find((l) => l.key === meal.location || l.label === meal.location);
  const foods = Array.isArray(meal.foods) ? meal.foods : [];
  const time = meal.meal_time ? meal.meal_time.slice(0, 5) : null;

  return (
    <PremiumCard className="p-4">
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-1.5 pt-1">
          <span className="text-2xl leading-none">{type.emoji}</span>
          {time && (
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-foreground">
              {time}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{type.label}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                {loc && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{loc.emoji} {loc.label}</span>}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={onEdit} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={onDelete} className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {photoUrl && (
            <img src={photoUrl} alt="" className="mt-3 h-40 w-full rounded-2xl border border-border/60 object-cover" />
          )}

          {foods.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {foods.map((f, i) => (
                <span key={i} className="rounded-full bg-muted/50 px-2.5 py-1 text-[11px] font-medium">
                  {f.name}{f.qty ? ` · ${f.qty}` : ""}
                </span>
              ))}
            </div>
          )}
          {foods.length === 0 && meal.food_name && (
            <p className="mt-2 text-sm">{meal.food_name}</p>
          )}

          {(meal.calories || meal.protein_g || meal.carbs_g || meal.fat_g) != null && (
            <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <MacroDot label={t("meals.kcal")} v={meal.calories} />
              <MacroDot label={t("meals.protein")} v={meal.protein_g} accent />
              <MacroDot label={t("meals.carbs")} v={meal.carbs_g} />
              <MacroDot label={t("meals.fat")} v={meal.fat_g} />
            </div>
          )}

          {meal.notes && <p className="mt-2 text-xs text-muted-foreground">{meal.notes}</p>}
        </div>
      </div>
    </PremiumCard>
  );
}

function MacroDot({ label, v, accent }: { label: string; v: number | null; accent?: boolean }) {
  if (v == null) return null;
  return (
    <span className="inline-flex items-baseline gap-1">
      <b className={cn("text-sm font-bold", accent ? "text-primary" : "text-foreground")}>{Math.round(Number(v))}</b>
      <span>{label}</span>
    </span>
  );
}

/* ---------- Add / edit sheet ---------- */
function AddMealSheet({
  initialMode, editing, bioDay, onClose, onSaved,
}: {
  initialMode: "manual" | "photo" | "favorite";
  editing: Meal | null;
  bioDay: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const now = new Date();

  const [mealType, setMealType] = useState<MealTypeDef>(
    editing?.meal_type ? MEAL_TYPE_BY_LABEL[editing.meal_type] ?? suggestMealType(now) : suggestMealType(now),
  );
  const [location, setLocation] = useState<LocationDef | null>(
    editing?.location ? LOCATIONS.find((l) => l.key === editing.location || l.label === editing.location) ?? null : LOCATIONS[0],
  );
  const [time, setTime] = useState<string>(
    editing?.meal_time?.slice(0, 5) ?? format(now, "HH:mm"),
  );
  const [date, setDate] = useState<string>(editing?.date ?? format(now, "yyyy-MM-dd"));
  const [foods, setFoods] = useState<FoodItem[]>(
    (editing?.foods && Array.isArray(editing.foods) && editing.foods.length > 0)
      ? editing.foods
      : editing?.food_name ? [{ name: editing.food_name }] : [{ name: "" }],
  );
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [existingPhoto, setExistingPhoto] = useState<string | null>(editing?.photo_url ?? null);
  const [showFavPicker, setShowFavPicker] = useState(initialMode === "favorite");
  const fileInput = useRef<HTMLInputElement>(null);

  const [cal, setCal] = useState(editing?.calories?.toString() ?? "");
  const [protein, setProtein] = useState(editing?.protein_g?.toString() ?? "");
  const [carbs, setCarbs] = useState(editing?.carbs_g?.toString() ?? "");
  const [fat, setFat] = useState(editing?.fat_g?.toString() ?? "");

  const favoritesQ = useQuery({
    queryKey: ["meal-favorites"],
    queryFn: async () => {
      const { data } = await supabase.from("meal_favorites").select("*").order("sort_order");
      return (data ?? []) as unknown as Favorite[];
    },
    enabled: showFavPicker,
  });

  // Auto-open camera when photo mode
  useEffect(() => {
    if (initialMode === "photo") setTimeout(() => fileInput.current?.click(), 150);
  }, [initialMode]);

  const onPickPhoto = (f: File | null) => {
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
    setExistingPhoto(null);
  };

  // Auto-sum macros from food items when user hasn't overridden
  useEffect(() => {
    if (editing) return;
    const sums = foods.reduce(
      (a, f) => ({
        c: a.c + (f.calories ?? 0),
        p: a.p + (f.protein_g ?? 0),
        cb: a.cb + (f.carbs_g ?? 0),
        f: a.f + (f.fat_g ?? 0),
      }),
      { c: 0, p: 0, cb: 0, f: 0 },
    );
    if (sums.c || sums.p || sums.cb || sums.f) {
      setCal(sums.c ? String(sums.c) : "");
      setProtein(sums.p ? String(sums.p) : "");
      setCarbs(sums.cb ? String(sums.cb) : "");
      setFat(sums.f ? String(sums.f) : "");
    }
  }, [foods, editing]);

  const applyFavorite = (f: Favorite) => {
    setFoods((prev) => {
      const cleaned = prev.filter((x) => x.name.trim());
      return [
        ...cleaned,
        {
          name: f.name,
          calories: f.calories ?? undefined,
          protein_g: f.protein_g ?? undefined,
          carbs_g: f.carbs_g ?? undefined,
          fat_g: f.fat_g ?? undefined,
        },
      ];
    });
    setShowFavPicker(false);
  };

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      let photoPath: string | null = existingPhoto;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = `${u.user.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("meal-photos").upload(path, photoFile, {
          contentType: photoFile.type,
          upsert: false,
        });
        if (error) throw error;
        photoPath = path;
      }

      const cleanFoods = foods.filter((f) => f.name.trim());
      const primaryName = cleanFoods[0]?.name || mealType.label;
      const payload = {
        user_id: u.user.id,
        date,
        biological_day: bioDay,
        meal_time: `${time}:00`,
        meal: mealType.enum,
        meal_type: mealType.label,
        location: location?.key ?? null,
        food_name: primaryName,
        foods: cleanFoods as unknown as never,
        calories: cal ? Number(cal) : null,
        protein_g: protein ? Number(protein) : null,
        carbs_g: carbs ? Number(carbs) : null,
        fat_g: fat ? Number(fat) : null,
        notes: notes.trim() || null,
        photo_url: photoPath,
        source: photoFile || existingPhoto ? "photo" : "manual",
      };

      if (editing) {
        const { error } = await supabase.from("nutrition_entries").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("nutrition_entries").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t("meals.saved"));
      qc.invalidateQueries({ queryKey: ["meals"] });
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateFood = (i: number, patch: Partial<FoodItem>) => {
    setFoods((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border-t border-border/60 bg-card shadow-soft animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <h3 className="text-lg font-bold">{editing ? t("meals.add") : t("meals.add")}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] space-y-5">
          {/* Meal type */}
          <Field label={t("meals.type")}>
            <div className="grid grid-cols-3 gap-2">
              {MEAL_TYPES.map((m) => (
                <ChipBtn key={m.key} active={mealType.key === m.key} onClick={() => setMealType(m)}>
                  <span className="text-lg leading-none">{m.emoji}</span>
                  <span className="text-[11px] font-medium leading-tight">{m.label}</span>
                </ChipBtn>
              ))}
            </div>
          </Field>

          {/* Location */}
          <Field label={t("meals.location")}>
            <div className="flex flex-wrap gap-2">
              {LOCATIONS.map((l) => (
                <ChipBtn key={l.key} active={location?.key === l.key} onClick={() => setLocation(l)} row>
                  <span>{l.emoji}</span>
                  <span className="text-xs font-medium">{l.label}</span>
                </ChipBtn>
              ))}
            </div>
          </Field>

          {/* Time & date */}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("meals.time")} icon={<Clock className="h-3.5 w-3.5" />}>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Field label={t("meals.date")}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          {/* Photo */}
          <Field label={t("meals.photo")}>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
            />
            {photoPreview || existingPhoto ? (
              <div className="relative">
                <img
                  src={photoPreview ?? "#"}
                  alt=""
                  className={cn("h-44 w-full rounded-2xl border border-border/60 object-cover", !photoPreview && "hidden")}
                />
                {!photoPreview && existingPhoto && (
                  <div className="grid h-44 w-full place-items-center rounded-2xl border border-border/60 bg-muted/40 text-xs text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="absolute bottom-2 end-2 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium shadow-soft"
                >
                  {t("meals.retakePhoto")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/70 bg-muted/20 text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
              >
                <Camera className="h-6 w-6" />
                <span className="text-xs">{t("meals.photoHint")}</span>
              </button>
            )}
          </Field>

          {/* Foods */}
          <Field label={t("meals.foods")}>
            <div className="space-y-2">
              {foods.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={f.name}
                    onChange={(e) => updateFood(i, { name: e.target.value })}
                    placeholder={t("meals.foodName")}
                    className="flex-1"
                  />
                  <Input
                    value={f.qty ?? ""}
                    onChange={(e) => updateFood(i, { qty: e.target.value })}
                    placeholder={t("meals.qty")}
                    className="w-24"
                  />
                  {foods.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFoods((p) => p.filter((_, idx) => idx !== i))}
                      className="rounded-xl p-2 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => setFoods((p) => [...p, { name: "" }])}
                  className="flex-1"
                >
                  <Plus className="me-1 h-3.5 w-3.5" /> {t("meals.addFood")}
                </Button>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => setShowFavPicker((s) => !s)}
                  className="flex-1"
                >
                  <Star className="me-1 h-3.5 w-3.5" /> {t("meals.favorites")}
                </Button>
              </div>
              {showFavPicker && (
                <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border/60 bg-muted/20 p-2.5">
                  {(favoritesQ.data ?? []).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => applyFavorite(f)}
                      className="flex flex-col items-center gap-1 rounded-xl bg-card p-2 text-center text-xs hover:border-primary/40"
                    >
                      <span className="text-lg">{f.emoji ?? "⭐"}</span>
                      <span className="leading-tight">{f.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>

          {/* Macros */}
          <Field label={t("meals.estimated")}>
            <div className="grid grid-cols-4 gap-2">
              <MacroInput label={t("meals.kcal")}   v={cal}     set={setCal} />
              <MacroInput label={t("meals.protein")} v={protein} set={setProtein} accent />
              <MacroInput label={t("meals.carbs")}   v={carbs}   set={setCarbs} />
              <MacroInput label={t("meals.fat")}     v={fat}     set={setFat} />
            </div>
          </Field>

          {/* Notes */}
          <Field label={t("meals.notes")}>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <div className="border-t border-border/60 bg-card px-5 py-3">
          <Button
            className="w-full"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            style={{ background: "var(--gradient-primary)" }}
          >
            <Heart className="me-2 h-4 w-4" />
            {t("meals.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Small building blocks ---------- */
function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      {children}
    </div>
  );
}

function ChipBtn({
  active, onClick, children, row,
}: { active: boolean; onClick: () => void; children: React.ReactNode; row?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-2xl border px-3 py-2.5 transition active:scale-95",
        row ? "flex-row" : "flex-col",
        active
          ? "border-primary/60 bg-primary/10 text-foreground shadow-glow"
          : "border-border/60 bg-card/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function MacroInput({
  label, v, set, accent,
}: { label: string; v: string; set: (v: string) => void; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-2 text-center">
      <input
        inputMode="decimal"
        value={v}
        onChange={(e) => set(e.target.value)}
        placeholder="0"
        className={cn(
          "w-full bg-transparent text-center text-base font-bold tabular-nums outline-none",
          accent && "text-primary",
        )}
      />
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

// Unused import guard for tree-shakers
export const __keep = ChevronLeft;
