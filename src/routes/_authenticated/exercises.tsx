import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Dumbbell, Search, SearchX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExerciseCard,
  useExerciseLibrary,
  type PickerExercise,
} from "@/components/workouts/ExercisePicker";
import { ExerciseDetailsSheet } from "@/components/workouts/ExerciseDetailsSheet";
import { normalizeMuscleGroup, type MuscleGroup } from "@/lib/muscle-groups";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/exercises")({
  component: ExerciseLibraryPage,
});

const PAGE_SIZE = 24;

function ExerciseLibraryPage() {
  const { q, all, results, term, setTerm, muscle, setMuscle } = useExerciseLibrary({
    coreOnly: true,
  });
  const [details, setDetails] = useState<PickerExercise | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const groups = useMemo(
    () =>
      [...new Set(all.map((exercise) => normalizeMuscleGroup(exercise.muscle_group)))].sort(
        (a, b) => a.localeCompare(b, "he"),
      ),
    [all],
  );

  useEffect(() => setVisible(PAGE_SIZE), [term, muscle]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible((current) =>
            current >= results.length ? current : current + PAGE_SIZE,
          );
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [results.length]);

  return (
    <div dir="rtl" className="space-y-4 pb-6">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="חזרה לאימונים">
          <Link to="/workouts">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">מאגר תרגילים</h1>
          <p className="text-sm text-muted-foreground">150 תרגילי הליבה של Viora</p>
        </div>
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Dumbbell className="h-5 w-5" aria-hidden />
        </div>
      </header>

      <div className="sticky top-0 z-10 -mx-1 space-y-3 rounded-2xl border border-border/60 bg-background/90 p-3 backdrop-blur-xl">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="חיפוש לפי שם התרגיל…"
            className="h-12 pr-9"
            autoComplete="off"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm("")}
              aria-label="נקה חיפוש"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <FilterChip active={!muscle} onClick={() => setMuscle(null)}>
            הכול
          </FilterChip>
          {groups.map((group) => (
            <FilterChip
              key={group}
              active={muscle === group}
              onClick={() => setMuscle(group as MuscleGroup)}
            >
              {group}
            </FilterChip>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[116px] w-full rounded-2xl" />
          ))}
        </div>
      ) : q.isError ? (
        <div className="surface-card grid place-items-center gap-3 p-8 text-center">
          <p className="text-sm text-muted-foreground">לא הצלחנו לטעון את מאגר התרגילים.</p>
          <Button size="sm" variant="outline" onClick={() => q.refetch()}>
            נסה שוב
          </Button>
        </div>
      ) : results.length === 0 ? (
        <div className="surface-card grid place-items-center gap-3 p-8 text-center">
          <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">לא נמצאו תרגילים שמתאימים לחיפוש.</p>
        </div>
      ) : (
        <section aria-live="polite">
          <p className="mb-2 text-xs text-muted-foreground">{results.length} תרגילים</p>
          <div className="space-y-2">
            {results.slice(0, visible).map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                ex={exercise}
                action="open"
                onPick={() => setDetails(exercise)}
              />
            ))}
          </div>
          <div ref={sentinel} className="h-8" aria-hidden />
        </section>
      )}

      <ExerciseDetailsSheet
        open={!!details}
        exercise={details}
        library={all}
        onClose={() => setDetails(null)}
        onOpenExercise={setDetails}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
        active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border/60 bg-muted/20 text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
