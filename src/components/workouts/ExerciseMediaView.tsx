/**
 * ExerciseMediaView — the shared read-only media frame for an exercise.
 *
 * Resolves a logical media slot (`thumbnail` → `main` → hero, `guide` → `main`
 * → hero, …) through `useExerciseMedia`, so the picker card, the details sheet
 * and the session hero all behave identically.
 */
import { useRef, useState } from "react";

import { useExerciseMedia } from "@/hooks/useExerciseMedia";
import {
  resolveExerciseMedia,
  resolveExerciseThumbnailStill,
  type ExerciseMediaSlot,
} from "@/lib/exercise-media";
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
  const { items, isPending, refetch } = useExerciseMedia({
    exerciseId,
    exerciseName: name,
  });
  const [failed, setFailed] = useState(false);
  const retriedRef = useRef(false);

  /**
   * Root cause of "assigned thumbnail falls back to the emoji placeholder":
   * the media list is cached with the signed-URL lifetime, so a URL that
   * expired (or a transient 4xx) permanently marked the slot as failed. Retry
   * once with fresh signed URLs before giving up on real media.
   */
  function handleError() {
    if (!retriedRef.current) {
      retriedRef.current = true;
      void refetch();
      return;
    }
    setFailed(true);
  }

  const slot: ExerciseMediaSlot = mediaRole ?? preferRole ?? "hero";
  /**
   * The thumbnail slot (Exercise Library cards) must always be a static
   * image: it goes through resolveExerciseThumbnailStill(), which rejects
   * video/animation outright, rather than resolveExerciseMedia()'s generic
   * (video-first) fallback used by every other slot.
   */
  const resolved =
    slot === "thumbnail" ? resolveExerciseThumbnailStill(items) : resolveExerciseMedia(items, slot);
  const usableHero = resolved && !failed ? resolved : null;
  const still = !usableHero && fallbackImage ? fallbackImage : null;

  // Belt-and-suspenders: the thumbnail slot can never render a <video>,
  // even if resolveExerciseThumbnailStill()'s guarantee were ever weakened.
  const isVideo = slot !== "thumbnail" && usableHero?.role === "video";
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
        onError={handleError}
      />
    ) : (
      <img
        key={usableHero.item.path}
        src={usableHero.item.url}
        alt={name ?? "תרגיל"}
        className={cn(fitClass, className)}
        loading="lazy"
        onError={handleError}
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
