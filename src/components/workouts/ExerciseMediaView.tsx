/**
 * ExerciseMediaView — the shared read-only media frame for an exercise.
 *
 * Uses the single existing resolution priority (Storage video → animation →
 * image → `exercises.image_path` → placeholder) via `useExerciseMedia`, so the
 * picker card, the details sheet and the session hero all behave identically.
 */
import { useState } from "react";

import { useExerciseMedia } from "@/hooks/useExerciseMedia";
import { cn } from "@/lib/utils";

export interface ExerciseMediaViewProps {
  exerciseId: string;
  name?: string | null;
  /** DB fallback (`exercises.image_path`). */
  fallbackImage?: string | null;
  className?: string;
  /** Rendered when nothing resolves. */
  placeholder: React.ReactNode;
}

export function ExerciseMediaView({
  exerciseId,
  name,
  fallbackImage,
  className,
  placeholder,
}: ExerciseMediaViewProps) {
  const { hero, isPending } = useExerciseMedia({ exerciseId, exerciseName: name });
  const [failed, setFailed] = useState(false);

  const usableHero = hero && !failed ? hero : null;
  const still = !usableHero && fallbackImage ? fallbackImage : null;

  if (isPending) return <div className={cn("animate-pulse bg-muted/50", className)} />;

  if (usableHero) {
    return usableHero.role === "video" ? (
      <video
        key={usableHero.item.path}
        src={usableHero.item.url}
        className={cn("object-cover", className)}
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
        className={cn("object-cover", className)}
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
        className={cn("object-cover", className)}
        loading="lazy"
      />
    );
  }

  return <>{placeholder}</>;
}
