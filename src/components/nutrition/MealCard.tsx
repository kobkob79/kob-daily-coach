/**
 * MealCard — the single rendering of one logged meal, shared between the
 * live "ארוחות" screen (editable) and the read-only meal history view.
 */
import { MapPin, Pencil, Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PremiumCard } from "@/components/ui-kit/Section";
import { LOCATIONS, MEAL_TYPE_BY_LABEL, type FoodItem } from "@/lib/meals";

export type Meal = {
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

export function MealCard({
  meal,
  photoUrl,
  onDelete,
  onEdit,
}: {
  meal: Meal;
  photoUrl: string | null;
  /** Omit both to render a read-only card (no edit/delete affordances). */
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const type = meal.meal_type
    ? (MEAL_TYPE_BY_LABEL[meal.meal_type] ?? { emoji: "🍽️", label: meal.meal_type })
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
                {loc && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {loc.emoji} {loc.label}
                  </span>
                )}
              </div>
            </div>
            {(onEdit || onDelete) && (
              <div className="flex shrink-0 gap-1">
                {onEdit && (
                  <button
                    onClick={onEdit}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={onDelete}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {photoUrl && (
            <img
              src={photoUrl}
              alt=""
              className="mt-3 h-40 w-full rounded-2xl border border-border/60 object-cover"
            />
          )}

          {foods.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {foods.map((f, i) => (
                <span
                  key={i}
                  className="rounded-full bg-muted/50 px-2.5 py-1 text-[11px] font-medium"
                >
                  {f.name}
                  {f.qty ? ` · ${f.qty}` : ""}
                </span>
              ))}
            </div>
          )}
          {foods.length === 0 && meal.food_name && <p className="mt-2 text-sm">{meal.food_name}</p>}

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

export function MacroDot({
  label,
  v,
  accent,
}: {
  label: string;
  v: number | null;
  accent?: boolean;
}) {
  if (v == null) return null;
  return (
    <span className="inline-flex items-baseline gap-1">
      <b className={cn("text-sm font-bold", accent ? "text-primary" : "text-foreground")}>
        {Math.round(Number(v))}
      </b>
      <span>{label}</span>
    </span>
  );
}
