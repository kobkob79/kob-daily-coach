/**
 * Exercise Details Sheet — "movie page" for a single exercise.
 *
 * Opens from the Exercise Picker instead of adding immediately, so the user can
 * inspect the exercise first. The hero area is a reserved 16:9 media slot: when
 * images/GIFs/videos/3D land later they drop straight into `<HeroMedia exercise={ex} />`
 * without touching the rest of the layout. Info/coaching blocks are separate
 * sections so AI tips, common mistakes and safety notes can be appended.
 */
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dumbbell, Play, Plus, Sparkles, Star, Trophy, X } from "lucide-react";
import { normalizeMuscleGroup } from "@/lib/muscle-groups";
import {
  difficultyOf,
  equipmentLabel,
  readFavorites,
  secondaryMuscles,
  whatItTrains,
  writeFavorites,
  type PickerExercise,
} from "@/lib/exercise-meta";
import {
  TREND_META,
  formatHebDate,
  formatRest,
  smartBadges,
  type ExerciseStats,
} from "@/lib/exercise-stats";
import { useExerciseIntel } from "@/hooks/useExerciseIntel";
import { ExerciseMediaView } from "./ExerciseMediaView";
import { cn } from "@/lib/utils";


interface Props {
  exercise: PickerExercise | null;
  open: boolean;
  onClose: () => void;
  /** Adds the exercise to the workout/routine. */
  onAdd: (exerciseId: string) => void;
  /** Full library, used to suggest related exercises. */
  library: PickerExercise[];
  /** Switches the sheet to another exercise (related list). */
  onOpenExercise: (ex: PickerExercise) => void;
}

export function ExerciseDetailsSheet({
  exercise, open, onClose, onAdd, library, onOpenExercise,
}: Props) {
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => setFavorites(readFavorites()), [open]);
  const intel = useExerciseIntel(exercise?.id, open);

  if (!exercise) return null;


  const ex = exercise;
  const primary = normalizeMuscleGroup(ex.muscle_group);
  const secondary = secondaryMuscles(ex);
  const diff = difficultyOf(ex);
  const isFav = favorites.includes(ex.id);

  const toggleFav = () => {
    const next = isFav ? favorites.filter((id) => id !== ex.id) : [...favorites, ex.id];
    setFavorites(next);
    writeFavorites(next);
  };

  const related = relatedExercises(ex, library);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        dir="rtl"
        className="h-[92dvh] overflow-hidden rounded-t-3xl border-border/60 p-0"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>{ex.name}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto overscroll-contain pb-4">
            {/* Hero media — reserved 16:9 slot for future image/GIF/video/3D */}
            <div className="relative">
              <HeroMedia exercise={ex} />
              <button
                type="button"
                onClick={onClose}
                aria-label="סגור"
                className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-background/70 backdrop-blur-md"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-4 pt-4">
              {/* Identity */}
              <div>
                <h2 className="text-xl font-bold leading-tight">{ex.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Tag className="bg-primary/15 text-primary">{primary}</Tag>
                  <Tag className="bg-muted/40 text-muted-foreground">
                    <Dumbbell className="h-3 w-3" aria-hidden /> {equipmentLabel(ex.equipment)}
                  </Tag>
                  <Tag className={diff.tone}>{diff.label}</Tag>
                  {!!ex.category?.trim() && (
                    <Tag className="bg-muted/40 text-muted-foreground">{ex.category}</Tag>
                  )}
                </div>
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-2">
                <MetaCell label="שריר עיקרי" value={primary} />
                <MetaCell label="שרירים משניים" value={secondary.length ? secondary.join(", ") : "—"} />
                <MetaCell label="ציוד" value={equipmentLabel(ex.equipment)} />
                <MetaCell label="רמת קושי" value={diff.label} />
                <MetaCell label="קטגוריה" value={ex.category?.trim() || primary} />
              </div>

              {/* What this trains */}
              <section className="surface-card space-y-1.5 rounded-2xl border border-border/60 p-3.5">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  מה התרגיל מאמן
                </p>
                <p className="text-sm leading-relaxed">{whatItTrains(ex)}</p>
              </section>

              {/* Personal intelligence */}
              {intel.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-24 w-full rounded-2xl" />
                  <Skeleton className="h-24 w-full rounded-2xl" />
                </div>
              ) : intel.data ? (
                <PersonalIntel
                  stats={intel.data.stats}
                  routines={intel.data.routines}
                  isFav={isFav}
                />
              ) : null}

              {/* Reserved AI coaching slot */}
              <section className="rounded-2xl border border-dashed border-border/60 p-3.5">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden /> Viora Coach
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  תובנות אישיות, טעויות נפוצות והמלצות אימון יופיעו כאן בקרוב.
                </p>
              </section>



              {/* Related */}
              {related.length > 0 && (
                <section className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    תרגילים דומים ל{primary}
                  </p>
                  <div className="space-y-2">
                    {related.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onOpenExercise(r)}
                        className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-2.5 text-right transition-colors hover:border-primary/50 hover:bg-card/70"
                      >
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-border/50 bg-muted/30 text-[10px] text-muted-foreground">
                          ▶
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {equipmentLabel(r.equipment)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 border-t border-border/60 bg-background/85 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
            <Button className="h-12 w-full text-base" onClick={() => onAdd(ex.id)}>
              <Plus className="ml-1 h-5 w-5" /> הוסף לאימון
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 flex-1" onClick={toggleFav}>
                <Star className={cn("ml-1 h-4 w-4", isFav && "fill-current text-primary")} />
                {isFav ? "במועדפים" : "הוסף למועדפים"}
              </Button>
              <Button variant="outline" className="h-11 flex-1" disabled>
                <Play className="ml-1 h-4 w-4" /> צפה בהדגמה (בקרוב)
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The personal dashboard: history, last performance, PRs, statistics,
 * trend, routine usage and auto-generated badges — all derived, zero input.
 */
function PersonalIntel({
  stats,
  routines,
  isFav,
}: {
  stats: ExerciseStats;
  routines: string[];
  isFav: boolean;
}) {
  const badges = smartBadges(stats, { isFavorite: isFav, routines });
  const trend = TREND_META[stats.trend];
  const never = stats.timesPerformed === 0;
  const last = stats.lastPerformance;
  const lastText =
    last && (last.weightKg != null || last.reps != null)
      ? last.weightKg != null && last.reps != null
        ? `${last.weightKg} ק״ג × ${last.reps}`
        : last.weightKg != null
          ? `${last.weightKg} ק״ג`
          : `${last.reps} חזרות`
      : "—";

  return (
    <div className="space-y-3">
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <Tag key={b.label} className={b.tone}>
              <span aria-hidden>{b.emoji}</span> {b.label}
            </Tag>
          ))}
        </div>
      )}

      <section className="surface-card space-y-2.5 rounded-2xl border border-border/60 p-3.5">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          ההיסטוריה שלי בתרגיל
        </p>
        {never ? (
          <p className="text-sm text-muted-foreground">
            עדיין לא ביצעת את התרגיל הזה — ברגע שתבצע, כל הנתונים האישיים יופיעו כאן.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <MetaCell label="ביצוע אחרון" value={formatHebDate(stats.lastPerformedAt)} />
              <MetaCell label="מספר ביצועים" value={String(stats.timesPerformed)} />
              <MetaCell label="ביצוע ראשון" value={formatHebDate(stats.firstPerformedAt)} />
            </div>

            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-primary">האימון האחרון</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{lastText}</p>
              <p className="text-[11px] text-muted-foreground">{formatHebDate(last?.at ?? null)}</p>
            </div>

            <Tag className={trend.tone}>
              <span aria-hidden>{trend.icon}</span> מגמה: {trend.label}
            </Tag>
          </>
        )}
      </section>

      {!never && (
        <>
          <section className="surface-card space-y-2 rounded-2xl border border-border/60 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Trophy className="h-3.5 w-3.5" aria-hidden /> שיאים אישיים
            </p>
            <div className="grid grid-cols-2 gap-2">
              <MetaCell
                label="🏆 משקל מקסימלי"
                value={stats.records.heaviestKg != null ? `${stats.records.heaviestKg} ק״ג` : "—"}
              />
              <MetaCell
                label="🏆 מקסימום חזרות"
                value={stats.records.mostReps != null ? String(stats.records.mostReps) : "—"}
              />
              <MetaCell
                label="🏆 1RM משוער"
                value={stats.records.best1RM != null ? `${stats.records.best1RM} ק״ג` : "—"}
              />
              <MetaCell
                label="🏆 נפח שיא"
                value={
                  stats.records.bestSessionVolume != null
                    ? `${stats.records.bestSessionVolume} ק״ג`
                    : "—"
                }
              />
            </div>
          </section>

          <section className="surface-card space-y-2 rounded-2xl border border-border/60 p-3.5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              סטטיסטיקה אישית
            </p>
            <div className="grid grid-cols-2 gap-2">
              <MetaCell
                label="משקל ממוצע"
                value={stats.averages.weightKg != null ? `${stats.averages.weightKg} ק״ג` : "—"}
              />
              <MetaCell
                label="חזרות בממוצע"
                value={stats.averages.reps != null ? String(stats.averages.reps) : "—"}
              />
              <MetaCell
                label="נפח ממוצע"
                value={
                  stats.averages.sessionVolume != null
                    ? `${stats.averages.sessionVolume} ק״ג`
                    : "—"
                }
              />
              <MetaCell label="מנוחה ממוצעת" value={formatRest(stats.averages.restSeconds)} />
              <MetaCell
                label="אחוז השלמה"
                value={
                  stats.completionRate != null
                    ? `${Math.round(stats.completionRate * 100)}%`
                    : "—"
                }
              />
            </div>
          </section>
        </>
      )}

      {routines.length > 0 && (
        <section className="surface-card space-y-1.5 rounded-2xl border border-border/60 p-3.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            בשימוש בשגרות
          </p>
          <div className="flex flex-wrap gap-1.5">
            {routines.map((r) => (
              <Tag key={r} className="bg-muted/40 text-muted-foreground">
                {r}
              </Tag>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}


/** Reserved 16:9 media area — premium placeholder until assets exist. */
function HeroMedia({ exercise }: { exercise: PickerExercise }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-muted/40 via-card/60 to-muted/20">
      <ExerciseMediaView
        exerciseId={exercise.id}
        name={exercise.name}
        fallbackImage={exercise.image_path}
        className="h-full w-full"
        placeholder={<HeroPlaceholder />}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}

function HeroPlaceholder() {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-border/60 bg-background/50 text-primary">
            <Dumbbell className="h-5 w-5" aria-hidden />
          </span>
          <p className="text-sm font-medium">תצוגת תרגיל</p>
          <p className="text-[11px] text-muted-foreground">מדיה תתווסף בקרוב</p>
        </div>
      </div>
    </div>
  );
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

/** Same muscle group first, then same equipment, capped at five. */
function relatedExercises(ex: PickerExercise, library: PickerExercise[]): PickerExercise[] {
  const group = normalizeMuscleGroup(ex.muscle_group);
  const pool = library.filter((c) => c.id !== ex.id);
  const sameGroup = pool.filter((c) => normalizeMuscleGroup(c.muscle_group) === group);
  const sameEquip = pool.filter(
    (c) =>
      normalizeMuscleGroup(c.muscle_group) !== group &&
      equipmentLabel(c.equipment) === equipmentLabel(ex.equipment),
  );
  return [...sameGroup, ...sameEquip].slice(0, 5);
}
