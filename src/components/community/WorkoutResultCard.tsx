/**
 * Workout Result feed/preview card (VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1).
 *
 * Renders only the sanitized WorkoutSharePayload snapshot already stored on
 * the post — never fetches another user's workout_sessions/workout_sets
 * itself, so there's no per-card N+1 source query and no way to leak a
 * private record even if this card is reused somewhere unexpected.
 *
 * Used both in the Community feed (compact, from a published post) and in
 * the Share Studio's live preview (the exact same component, fed the
 * in-progress payload) — one rendering, so the preview can never drift
 * from what actually gets published.
 */
import { useId, useState } from "react";
import { ChevronDown, Dumbbell, MapPin, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatExerciseSetLine,
  formatSetCompletionLabel,
  type WorkoutSharePayload,
} from "@/lib/community-workout-share";

function formatWorkoutDate(dateISO: string): string {
  try {
    return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long" }).format(
      new Date(dateISO),
    );
  } catch {
    return "";
  }
}

export function WorkoutResultCard({
  payload,
  photoUrl,
  className,
}: {
  payload: WorkoutSharePayload;
  photoUrl?: string | null;
  className?: string;
}) {
  const [debriefOpen, setDebriefOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const debriefId = useId();
  const breakdownId = useId();

  const hasBreakdown = payload.exercises.length > 0;
  const hasFullDebrief = Boolean(payload.coachFull && payload.coachFull.length > 0);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border/60 bg-card shadow-soft",
        className,
      )}
      aria-label={`תוצאת אימון${payload.workoutName ? `: ${payload.workoutName}` : ""}`}
    >
      {photoUrl ? (
        <div className="relative">
          <img
            src={photoUrl}
            alt={payload.workoutName ? `תמונה מהאימון ${payload.workoutName}` : "תמונה מהאימון"}
            className="h-48 w-full object-cover"
          />
          {/* Strong contrast scrim so the headline stays readable over any photo. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 p-3 text-white">
            <WorkoutHeadline payload={payload} onLight />
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-primary/15 via-accent/10 to-transparent p-4">
          <WorkoutHeadline payload={payload} onLight={false} />
        </div>
      )}

      <div className="space-y-3 p-4">
        {payload.isPartial && (
          <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            אימון חלקי · {formatSetCompletionLabel(payload)}
          </span>
        )}

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="סטים הושלמו" value={String(payload.completedSetCount)} />
          <Stat label="חזרות" value={String(payload.totalReps)} />
          <Stat label="נפח" value={`${payload.totalVolumeKg.toLocaleString("he-IL")} ק״ג`} />
          {payload.durationMinutes != null && (
            <Stat label="משך" value={`${payload.durationMinutes} דק'`} />
          )}
        </dl>

        {payload.bestSet && (
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <Trophy className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <span className="min-w-0 truncate">
              הסט הטוב ביותר: {payload.bestSet.exerciseName} —{" "}
              <bdi dir="ltr">
                {payload.bestSet.weightKg} ק״ג × {payload.bestSet.reps}
              </bdi>
            </span>
          </p>
        )}

        {payload.primaryMuscleGroups.length > 0 && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Dumbbell className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{payload.primaryMuscleGroups.join(" · ")}</span>
          </p>
        )}

        {payload.locationLabel && (
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{payload.locationLabel}</span>
          </p>
        )}

        {payload.caption && <p className="whitespace-pre-wrap text-sm">{payload.caption}</p>}

        {hasBreakdown && (
          <div>
            <button
              type="button"
              onClick={() => setBreakdownOpen((v) => !v)}
              aria-expanded={breakdownOpen}
              aria-controls={breakdownId}
              className="flex min-h-11 w-full items-center justify-between rounded-lg border border-border/50 px-3 text-sm font-medium text-foreground"
            >
              פירוט תרגילים
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform motion-reduce:transition-none",
                  breakdownOpen && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>
            {breakdownOpen && (
              <ul id={breakdownId} className="mt-2 space-y-1.5 text-sm">
                {payload.exercises.map((exercise, i) => (
                  <li key={i} className="flex min-w-0 flex-wrap items-baseline gap-x-1">
                    <span className="min-w-0 truncate font-medium">{exercise.name}</span>
                    <span className="text-muted-foreground">
                      — <bdi dir="ltr">{formatExerciseSetLine(exercise)}</bdi>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {(payload.coachSummary || hasFullDebrief) && (
          <div className="rounded-xl bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              תחקיר מאמן
            </p>
            {!debriefOpen && (
              <p className="mt-1 text-sm leading-relaxed">
                {payload.coachSummary ?? payload.coachFull?.[0]}
              </p>
            )}
            {debriefOpen && hasFullDebrief && (
              <div id={debriefId} className="mt-1 space-y-1.5 text-sm leading-relaxed">
                {payload.coachFull!.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            )}
            {hasFullDebrief && (
              <button
                type="button"
                onClick={() => setDebriefOpen((v) => !v)}
                aria-expanded={debriefOpen}
                aria-controls={debriefId}
                className="mt-1.5 min-h-11 text-sm font-semibold text-primary"
              >
                {debriefOpen ? "כווץ" : "קרא את התחקיר המלא"}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function WorkoutHeadline({ payload, onLight }: { payload: WorkoutSharePayload; onLight: boolean }) {
  return (
    <div className={cn("min-w-0", onLight ? "text-white" : "text-foreground")}>
      <h3 className="line-clamp-2 text-lg font-extrabold leading-tight">
        {payload.workoutName ?? "אימון"}
      </h3>
      <p className={cn("text-xs", onLight ? "text-white/80" : "text-muted-foreground")}>
        {formatWorkoutDate(payload.dateISO)}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="truncate text-base font-bold tabular-nums">
        <bdi dir="ltr">{value}</bdi>
      </dd>
    </div>
  );
}
