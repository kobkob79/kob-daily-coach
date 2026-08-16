/**
 * ExerciseMediaView — the shared read-only media frame for an exercise.
 *
 * Can render either the legacy hero resolution or an explicitly assigned
 * media role such as thumbnail, main image or demo video.
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
  mediaRole?: "hero" | "thumbnail" | "main" | "demo";
}

export function ExerciseMediaView({
  exerciseId,
  name,
  fallbackImage,
  className,
  placeholder,
  mediaRole = "hero",
}: ExerciseMediaViewProps) {
  const { hero, thumbnail, main, demo, isPending } = useExerciseMedia({
    exerciseId,
    exerciseName: name,
  });

  const [failed, setFailed] = useState(false);

  const selectedMedia =
    mediaRole === "thumbnail"
      ? thumbnail
      : mediaRole === "main"
        ? main
        : mediaRole === "demo"
          ? demo
          : hero?.item ?? null;

  const usableMedia = selectedMedia && !failed ? selectedMedia : null;
  const still = !usableMedia && fallbackImage ? fallbackImage : null;

  if (isPending) {
    return <div className={cn("animate-pulse bg-muted/50", className)} />;
  }

  if (usableMedia) {
    return usableMedia.kind === "video" ? (
      <video
        key={usableMedia.path}
        src={usableMedia.url}
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
        key={usableMedia.path}
        src={usableMedia.url}
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