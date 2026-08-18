/**
 * ExerciseMediaView — the shared read-only media frame for an exercise.
 *
 * Resolves a logical media slot (`thumbnail` → `main` → hero, `guide` → `main`
 * → hero, …) through `useExerciseMedia`, so the picker card, the details sheet
 * and the session hero all behave identically.
 */
import { useState } from "react";

import { useExerciseMedia } from "@/hooks/useExerciseMedia";
import { resolveExerciseMedia, type ExerciseMediaSlot } from "@/lib/exercise-media";
import { cn } from "@/lib/utils";

export interface ExerciseMediaViewProps {
  exerciseId: string;
  name?: string | null;
  /** DB fallback (`exercises.image_path`). */
  fallbackImage?: string | null;
  className?: string;
  /** Rendered when nothing resolves. */
  placeholder: React.ReactNode;
  /** Logical slot to render. Defaults to the generic hero priority. */
  mediaRole?: ExerciseMediaSlot;
  /** @deprecated use `mediaRole`. */
  preferRole?: "thumbnail" | "main" | "demo";
  /** Object fit override; slot defaults are used when omitted. */
  fit?: "cover" | "contain";
}

/** Instructional stills should never be cropped; motion media may fill. */
const CONTAIN_SLOTS: ExerciseMediaSlot[] = ["thumbnail", "main", "guide"];

export function ExerciseMediaView({
  exerciseId,
  name,
  fallbackImage,
  className,
  placeholder,
  mediaRole,
  preferRole,
  fit,
}: ExerciseMediaViewProps) {
  const { items, isPending } = useExerciseMedia({ exerciseId, exerciseName: name });
  const [failed, setFailed] = useState(false);

  const slot: ExerciseMediaSlot = mediaRole ?? preferRole ?? "hero";
  const resolved = resolveExerciseMedia(items, slot);
  const usableHero = resolved && !failed ? resolved : null;
  const still = !usableHero && fallbackImage ? fallbackImage : null;

  const isVideo = usableHero?.role === "video";
  const objectFit =
    fit ?? (CONTAIN_SLOTS.includes(slot) && !isVideo ? "contain" : "cover");
  const fitClass = objectFit === "contain" ? "object-contain" : "object-cover";

  if (isPending) return <div className={cn("animate-pulse bg-muted/50", className)} />;

  if (usableHero) {
    return isVideo ? (
      <video
        key={usableHero.item.path}
        src={usableHero.item.url}
        className={cn(fitClass, className)}
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
        className={cn(fitClass, className)}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  if (still) {
    return (
      <img
        src={still}
        alt={name ?? "תרגיל"}
        className={cn(fitClass, className)}
        loading="lazy"
      />
    );
  }

  return <>{placeholder}</>;
}
