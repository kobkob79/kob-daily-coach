/**
 * Exercise Picker 2.0 — premium exercise discovery.
 *
 * A discovery surface (not a database browser): sticky search, muscle-group
 * chips, equipment chips, premium cards with a reserved media area for future
 * images/GIFs, skeleton loading, friendly empty state, and incremental
 * rendering so very large libraries stay smooth.
 *
 * Purely presentational over the existing `exercises` table — no schema or
 * data-layer changes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dumbbell, Image as ImageIcon, Plus, Search, SearchX, X } from "lucide-react";
import { normalizeMuscleGroup, type MuscleGroup } from "@/lib/muscle-groups";
import {
  EQUIPMENT_CHIPS,
  difficultyOf,
  equipmentKey,
  equipmentLabel,
  type EquipmentKey,
  type PickerExercise,
} from "@/lib/exercise-meta";
import { ExerciseDetailsSheet } from "./ExerciseDetailsSheet";
import { cn } from "@/lib/utils";

export type { PickerExercise };

/** Muscle chips shown horizontally, in Hebrew with an emoji cue. */
const MUSCLE_CHIPS: { group: MuscleGroup; emoji: string }[] = [
  { group: "חזה", emoji: "💪" },
  { group: "גב", emoji: "🏋" },
  { group: "רגליים", emoji: "🦵" },
  { group: "כתפיים", emoji: "🦾" },
  { group: "יד קדמית", emoji: "💪" },
  { group: "יד אחורית", emoji: "🔥" },
  { group: "בטן", emoji: "🧱" },
  { group: "שרירי ליבה", emoji: "🧘" },
  { group: "קרדיו", emoji: "🏃" },
  { group: "מוביליטי", emoji: "🤸" },
];

/** Lightweight alias index so Hebrew/English searches both hit. */
const ALIASES: { test: RegExp; words: string[] }[] = [
  { test: /לחיצת חזה|bench/i, words: ["bench press", "לחיצות", "חזה"] },
  { test: /סקוואט|squat/i, words: ["squat", "רגליים", "כפיפות"] },
  { test: /דדליפט|deadlift/i, words: ["deadlift", "גב", "הרמת מתים"] },
  { test: /מתח|pull.?up/i, words: ["pull up", "גב", "מתח"] },
  { test: /שכיב|push.?up/i, words: ["push up", "שכיבות סמיכה", "חזה"] },
  { test: /חתירה|row/i, words: ["row", "חתירה", "גב"] },
  { test: /כתף|press/i, words: ["shoulder press", "כתפיים"] },
  { test: /בייספס|biceps|כפיפ/i, words: ["biceps", "curl", "יד קדמית"] },
  { test: /טרייספס|triceps|פשיט/i, words: ["triceps", "יד אחורית"] },
  { test: /פלאנק|plank|בטן/i, words: ["plank", "core", "בטן"] },
];

function searchHaystack(ex: PickerExercise): string {
  const extra = ALIASES.filter((a) => a.test.test(ex.name)).flatMap((a) => a.words);
  return [
    ex.name,
    ex.muscle_group ?? "",
    normalizeMuscleGroup(ex.muscle_group),
    ex.equipment ?? "",
    equipmentLabel(ex.equipment),
    ex.category ?? "",
    ...extra,
  ]
    .join(" ")
    .toLowerCase();
}

const PAGE = 24;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen exercise id. */
  onSelect: (exerciseId: string) => void;
  title?: string;
}

export function ExercisePicker({ open, onClose, onSelect, title = "בחר תרגיל" }: Props) {
  const q = useQuery({
    enabled: open,
    queryKey: ["exercises", "picker"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id,name,muscle_group,equipment,category,description")
        .order("name");
      if (error) throw error;
      return (data ?? []) as PickerExercise[];
    },
  });

  const [term, setTerm] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equip, setEquip] = useState<EquipmentKey | null>(null);
  const [visible, setVisible] = useState(PAGE);
  const [details, setDetails] = useState<PickerExercise | null>(null);


  const all = q.data ?? [];

  const indexed = useMemo(
    () => all.map((ex) => ({ ex, hay: searchHaystack(ex), group: normalizeMuscleGroup(ex.muscle_group), eq: equipmentKey(ex.equipment) })),
    [all],
  );

  const results = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return indexed
      .filter((r) => (muscle ? r.group === muscle : true))
      .filter((r) => (equip ? r.eq === equip : true))
      .filter((r) => (needle ? needle.split(/\s+/).every((w) => r.hay.includes(w)) : true))
      .map((r) => r.ex);
  }, [indexed, term, muscle, equip]);

  // Reset the render window whenever the result set changes.
  useEffect(() => setVisible(PAGE), [term, muscle, equip, all.length]);

  // Incremental rendering keeps scrolling smooth on huge libraries.
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setVisible((v) => (v >= results.length ? v : v + PAGE));
      }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [results.length, open]);

  const hasFilters = !!term.trim() || !!muscle || !!equip;
  const clearFilters = () => {
    setTerm("");
    setMuscle(null);
    setEquip(null);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[92dvh] p-0" dir="rtl">
        <div className="flex h-full flex-col">
          <SheetHeader className="px-4 pt-4 text-right">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>

          {/* Sticky search + filters */}
          <div className="sticky top-0 z-10 space-y-2 border-b border-border/60 bg-background/85 px-4 pb-3 pt-3 backdrop-blur-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="חפש תרגיל, שריר או ציוד…"
                className="h-11 pr-9"
                autoComplete="off"
              />
              {!!term && (
                <button
                  onClick={() => setTerm("")}
                  aria-label="נקה חיפוש"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <ChipRow>
              {MUSCLE_CHIPS.map((c) => (
                <Chip
                  key={c.group}
                  active={muscle === c.group}
                  onClick={() => setMuscle(muscle === c.group ? null : c.group)}
                >
                  <span aria-hidden>{c.emoji}</span> {c.group}
                </Chip>
              ))}
            </ChipRow>

            <ChipRow>
              {EQUIPMENT_CHIPS.map((c) => (
                <Chip
                  key={c.key}
                  active={equip === c.key}
                  onClick={() => setEquip(equip === c.key ? null : c.key)}
                >
                  <span aria-hidden>{c.emoji}</span> {c.label}
                </Chip>
              ))}
            </ChipRow>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            {q.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-3 rounded-2xl border border-border/60 p-2.5">
                    <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
                    <div className="flex-1 space-y-2 py-1">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/3" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : q.isError ? (
              <div className="grid place-items-center gap-3 rounded-2xl border border-border/60 p-8 text-center">
                <p className="text-sm text-muted-foreground">לא הצלחנו לטעון את מאגר התרגילים.</p>
                <Button size="sm" variant="outline" onClick={() => q.refetch()}>
                  🔄 נסה שוב
                </Button>
              </div>
            ) : results.length === 0 ? (
              <div className="grid place-items-center gap-3 rounded-2xl border border-border/60 p-8 text-center">
                <SearchX className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">לא מצאנו תרגיל שמתאים לחיפוש</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    נסה שם אחר או הסר כמה מסננים.
                  </p>
                </div>
                {hasFilters && (
                  <Button size="sm" variant="outline" onClick={clearFilters}>
                    נקה מסננים
                  </Button>
                )}
              </div>
            ) : (
              <>
                <p className="mb-2 text-[11px] text-muted-foreground">
                  {results.length} תרגילים
                </p>
                <div className="space-y-2">
                  {results.slice(0, visible).map((ex) => (
                    <ExerciseCard
                      key={ex.id}
                      ex={ex}
                      onPick={() => setDetails(ex)}
                    />

                  ))}
                </div>
                <div ref={sentinel} className="h-8" />
              </>
            )}
          </div>
        </div>
      </SheetContent>
      </SheetContent>

      <ExerciseDetailsSheet
        open={!!details}
        exercise={details}
        library={all}
        onClose={() => setDetails(null)}
        onOpenExercise={(ex) => setDetails(ex)}
        onAdd={(id) => {
          setDetails(null);
          onSelect(id);
          onClose();
        }}
      />
    </Sheet>
  );

}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

function Chip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border/60 bg-muted/20 text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ExerciseCard({ ex, onPick }: { ex: PickerExercise; onPick: () => void }) {
  const diff = difficultyOf(ex);
  return (
    <button
      type="button"
      onClick={onPick}
      className="group flex w-full items-stretch gap-3 rounded-2xl border border-border/60 bg-card/40 p-2.5 text-right transition-colors hover:border-primary/50 hover:bg-card/70 [content-visibility:auto] [contain-intrinsic-size:88px]"
    >
      {/* Reserved media area — future image/GIF slot */}
      <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/50 bg-muted/30">
        <ImageIcon className="h-5 w-5 text-muted-foreground/60" aria-hidden />
      </div>

      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-sm font-semibold">{ex.name}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {normalizeMuscleGroup(ex.muscle_group)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
            <Dumbbell className="h-3 w-3" aria-hidden />
            {equipmentLabel(ex.equipment)}
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", diff.tone)}>
            {diff.label}
          </span>
        </div>
      </div>

      <div className="grid w-8 shrink-0 place-items-center">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-primary">
          <Plus className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
}
