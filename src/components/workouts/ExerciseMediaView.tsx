/**
 * ExerciseMediaView — the shared read-only media frame for an exercise.
 *
 * Uses the single existing resolution priority (Storage video → animation →
 * image → `exercises.image_path` → placeholder) via `useExerciseMedia`, so the
 * picker card, the details sheet and the session hero all behave identically.
 */
import { useState } from "react";

import { useExerciseMedia } from "@/hooks/useExerciseMedia";
import { pickRoleMedia } from "@/lib/exercise-media";
import { cn } from "@/lib/utils";

export interface ExerciseMediaViewProps {
  exerciseId: string;
  name?: string | null;
  /** DB fallback (`exercises.image_path`). */
  fallbackImage?: string | null;
  className?: string;
  /** Rendered when nothing resolves. */
  placeholder: React.ReactNode;
  /**
   * Prefer an explicitly assigned canonical role file (`thumbnail.*`,
   * `main.*`, `demo.*`). Falls back to the default hero priority when the
   * exercise has no file for that role. Omit to keep legacy behavior.
   */
  preferRole?: "thumbnail" | "main" | "demo";
}

export function ExerciseMediaView({
  exerciseId,
  name,
  fallbackImage,
  className,
  placeholder,
  preferRole,
}: ExerciseMediaViewProps) {
  const { hero, items, isPending } = useExerciseMedia({ exerciseId, exerciseName: name });
  const [failed, setFailed] = useState(false);

  const resolved = (preferRole ? pickRoleMedia(items, preferRole) : null) ?? hero;
  const usableHero = resolved && !failed ? resolved : null;
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
