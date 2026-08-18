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
import { ArrowUpRight, Dumbbell, ImageOff, X } from "lucide-react";

import { useExerciseMedia } from "@/hooks/useExerciseMedia";
import { EXERCISE_MEDIA_ROLE_LABEL } from "@/lib/exercise-media";
import { cn } from "@/lib/utils";
import { ExerciseMediaView } from "./ExerciseMediaView";

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
  const [guideOpen, setGuideOpen] = useState(false);
  const showMoreLabel = "מדריך מלא";
  const guideUnavailableLabel = "\u05d8\u05e8\u05dd \u05e9\u05d5\u05d9\u05db\u05d4 \u05ea\u05de\u05d5\u05e0\u05ea \u05de\u05d3\u05e8\u05d9\u05da \u05dc\u05ea\u05e8\u05d2\u05d9\u05dc";
  const { hero, isPending } = useExerciseMedia({ exerciseId, exerciseName: name });
  const [failed, setFailed] = useState(false);

  const usableHero = hero && !failed ? hero : null;
  const stillFallback = !usableHero && fallbackImage ? fallbackImage : null;

  return (
    <div className="surface-card overflow-hidden p-0">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/30">

        {isPending ? (
          <div className="h-full w-full animate-pulse bg-muted/50" />
        ) : usableHero ? (
          usableHero.role === "video" ? (
            <video
              key={usableHero.item.path}
              src={usableHero.item.url}
              className="h-full w-full object-contain"
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
              className="h-full w-full object-contain"
              loading="lazy"
              onError={() => setFailed(true)}
            />
          )
        ) : stillFallback ? (
          <img
            src={stillFallback}
            alt={name ?? "תרגיל"}
            className="h-full w-full object-contain"
            loading="lazy"
          />
        ) : (
          <HeroPlaceholder failed={failed} />
        )}

        {/* Legibility scrim + media-type pill */}
        {usableHero && (
          <span className="absolute left-2 top-2 rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[9px] font-bold text-muted-foreground backdrop-blur-md">
            {EXERCISE_MEDIA_ROLE_LABEL[usableHero.role]}
          </span>
        )}
        {exerciseIndex && exerciseTotal ? (
          <span className="absolute right-2 top-2 rounded-full border border-primary/40 bg-background/70 px-2 py-0.5 text-[9px] font-bold text-primary backdrop-blur-md">
            תרגיל {exerciseIndex}/{exerciseTotal}
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-lg"
>
          <ArrowUpRight className="h-3.5 w-3.5" />
          {showMoreLabel}
        </button>
      </div>

      <div className="px-3 pb-3 pt-2">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 flex-1 truncate text-lg font-extrabold leading-tight">
            {name ?? "—"}
          </h1>
          {titleAdornment}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {muscleGroup ? <MetaPill label={muscleGroup} tone="primary" /> : null}
          {equipment ? <MetaPill label={equipment} /> : null}
        </div>
        {footer ? <div className="mt-1.5">{footer}</div> : null}

      </div>

      {guideOpen && (
  <div className="fixed inset-0 z-[100] bg-background">
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <p className="truncate text-sm font-semibold">{name}</p>

        <button
          type="button"
          onClick={() => setGuideOpen(false)}
          aria-label="סגור"
          className="grid h-10 w-10 place-items-center rounded-full border border-border/60 bg-background"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 bg-black">
        <ExerciseMediaView
          exerciseId={exerciseId}
          name={name}
          fallbackImage={fallbackImage}
          mediaRole="guide"
          fit="contain"
          className="h-full w-full"
          placeholder={
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-white/70">
              {guideUnavailableLabel}
            </div>
          }
        />
      </div>

      <div className="border-t border-border/60 bg-background p-3">
        <button
          type="button"
          onClick={() => setGuideOpen(false)}
          className="h-12 w-full rounded-2xl bg-primary text-sm font-bold text-primary-foreground"
        >
          סגור ולחזור לתרגיל
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}

function MetaPill({ label, tone }: { label: string; tone?: "primary" }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-semibold",

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
