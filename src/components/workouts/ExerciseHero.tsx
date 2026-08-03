/**
 * ExerciseHero — the media + identity block at the top of every exercise in an
 * active workout session.
 *
 * Media is resolved dynamically from Storage with the priority
 * video → animation → image → placeholder (see `useExerciseMedia`). The DB
 * `image_path` column is used as a last resort before the placeholder.
 * Loading shows a skeleton; a failed/absent asset degrades to the placeholder
 * without ever breaking the layout.
 */
import { useState } from "react";
import { Dumbbell, ImageOff } from "lucide-react";

import { useExerciseMedia } from "@/hooks/useExerciseMedia";
import { EXERCISE_MEDIA_ROLE_LABEL } from "@/lib/exercise-media";
import { cn } from "@/lib/utils";

export interface ExerciseHeroProps {
  exerciseId: string;
  name: string | null | undefined;
  muscleGroup?: string | null;
  equipment?: string | null;
  /** 1-based position of this exercise inside the session. */
  exerciseIndex?: number | null;
  exerciseTotal?: number | null;
  /** Fallback still coming from the exercises table. */
  fallbackImage?: string | null;
  /** Optional trailing node next to the title (e.g. a PR trophy). */
  titleAdornment?: React.ReactNode;
  /** Optional line under the header (e.g. personal record summary). */
  footer?: React.ReactNode;
}

export function ExerciseHero({
  exerciseId,
  name,
  muscleGroup,
  equipment,
  exerciseIndex,
  exerciseTotal,
  fallbackImage,
  titleAdornment,
  footer,
}: ExerciseHeroProps) {
  const { hero, isPending } = useExerciseMedia({ exerciseId, exerciseName: name });
  const [failed, setFailed] = useState(false);

  const usableHero = hero && !failed ? hero : null;
  const stillFallback = !usableHero && fallbackImage ? fallbackImage : null;

  return (
    <div className="surface-card overflow-hidden p-0">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted/30">
        {isPending ? (
          <div className="h-full w-full animate-pulse bg-muted/50" />
        ) : usableHero ? (
          usableHero.role === "video" ? (
            <video
              key={usableHero.item.path}
              src={usableHero.item.url}
              className="h-full w-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              onError={() => setFailed(true)}
            />
          ) : (
            <img
              key={usableHero.item.path}
              src={usableHero.item.url}
              alt={name ?? "תרגיל"}
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setFailed(true)}
            />
          )
        ) : stillFallback ? (
          <img
            src={stillFallback}
            alt={name ?? "תרגיל"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <HeroPlaceholder failed={failed} />
        )}

        {/* Legibility scrim + media-type pill */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/10 to-transparent" />
        {usableHero && (
          <span className="absolute left-3 top-3 rounded-full border border-border/50 bg-background/70 px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground backdrop-blur-md">
            {EXERCISE_MEDIA_ROLE_LABEL[usableHero.role]}
          </span>
        )}
        {exerciseIndex && exerciseTotal ? (
          <span className="absolute right-3 top-3 rounded-full border border-primary/40 bg-background/70 px-2.5 py-0.5 text-[10px] font-bold text-primary backdrop-blur-md">
            תרגיל {exerciseIndex} מתוך {exerciseTotal}
          </span>
        ) : null}
      </div>

      <div className="px-4 pb-4 pt-3">
        <h1 className="flex items-center gap-2 text-2xl font-extrabold leading-tight">
          <span className="min-w-0 truncate">{name ?? "—"}</span>
          {titleAdornment}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {muscleGroup ? <MetaPill label={muscleGroup} tone="primary" /> : null}
          {equipment ? <MetaPill label={equipment} /> : null}
        </div>
        {footer ? <div className="mt-2">{footer}</div> : null}
      </div>
    </div>
  );
}

function MetaPill({ label, tone }: { label: string; tone?: "primary" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        tone === "primary"
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 bg-muted/40 text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function HeroPlaceholder({ failed }: { failed: boolean }) {
  return (
    <div className="grid h-full w-full place-items-center bg-[image:var(--gradient-hero)]">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        {failed ? (
          <ImageOff className="h-8 w-8" />
        ) : (
          <Dumbbell className="h-8 w-8 text-primary/70" />
        )}
        <span className="text-[11px]">{failed ? "המדיה לא נטענה" : "אין מדיה לתרגיל"}</span>
      </div>
    </div>
  );
}
