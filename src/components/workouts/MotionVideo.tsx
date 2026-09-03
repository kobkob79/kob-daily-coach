/**
 * MotionVideo — the shared Motion Video surface for an exercise.
 *
 * Wraps the single `<video>` element (muted / playsInline, same frame layout as
 * before) and adds one visible, keyboard- and touch-operable Play / Pause /
 * Replay control. All playback behaviour lives in `useMotionVideoPlayback`.
 *
 * Reduced Motion / hydration: the server and hydration render carry no autoplay
 * (fail-safe — no flash, no SSR/client mismatch). Once hydrated and the media
 * is ready, a normal user's video plays exactly three cycles and then stops (no
 * native infinite `loop`); a Reduced Motion user's stays paused. Enabling
 * Reduced Motion pauses immediately; disabling it does not resume.
 *
 * Replay: after three cycles the control switches to "הפעל שוב"; tapping the
 * video does the same. Pause/resume keeps the cycle count.
 *
 * Lifecycle: exactly one `<video>`, paused on unmount. The signed-URL
 * retry/error fallback is unchanged — `onError` is forwarded straight to the
 * `<video>` so `ExerciseMediaView` can refetch once and then fall back to a
 * still/placeholder.
 */
import { Pause, Play, RotateCcw } from "lucide-react";
import { useRef } from "react";

import { useIsHydrated, usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useMotionVideoPlayback } from "@/hooks/useMotionVideoPlayback";
import { cn } from "@/lib/utils";

import {
  MOTION_VIDEO_COMPLETE_STATUS,
  MOTION_VIDEO_PAUSE_LABEL,
  MOTION_VIDEO_PAUSE_SHORT,
  MOTION_VIDEO_PAUSED_STATUS,
  MOTION_VIDEO_PLAY_LABEL,
  MOTION_VIDEO_PLAY_SHORT,
  MOTION_VIDEO_PLAYING_STATUS,
  MOTION_VIDEO_REPLAY_LABEL,
  MOTION_VIDEO_REPLAY_SHORT,
} from "./motion-video-labels";

export interface MotionVideoProps {
  /** Signed media URL. */
  src: string;
  /** Stable identity of the underlying media item (Storage path). */
  mediaKey: string;
  /** Exercise name, used for the video's accessible name. */
  name?: string | null;
  /** Sizing/rounding classes for the media frame (applied to the wrapper). */
  className?: string;
  /** `object-contain` / `object-cover` for the video element. */
  fitClass: string;
  /** Forwarded verbatim to the `<video>` so the signed-URL retry still fires. */
  onError: React.ReactEventHandler<HTMLVideoElement>;
}

export function MotionVideo({
  src,
  mediaKey,
  name,
  className,
  fitClass,
  onError,
}: MotionVideoProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const hydrated = useIsHydrated();
  // Only ever true after hydration, and never for a Reduced Motion user - used
  // to hint eager buffering so the readiness-gated first play starts promptly.
  const autoplayAllowed = hydrated && !prefersReducedMotion;
  const videoRef = useRef<HTMLVideoElement>(null);

  const { isPlaying, runComplete, toggle, onSurfaceActivate } = useMotionVideoPlayback({
    videoRef,
    hydrated,
    prefersReducedMotion,
    mediaKey,
  });

  const controlLabel = runComplete
    ? MOTION_VIDEO_REPLAY_LABEL
    : isPlaying
      ? MOTION_VIDEO_PAUSE_LABEL
      : MOTION_VIDEO_PLAY_LABEL;
  const controlShort = runComplete
    ? MOTION_VIDEO_REPLAY_SHORT
    : isPlaying
      ? MOTION_VIDEO_PAUSE_SHORT
      : MOTION_VIDEO_PLAY_SHORT;
  const statusText = runComplete
    ? MOTION_VIDEO_COMPLETE_STATUS
    : isPlaying
      ? MOTION_VIDEO_PLAYING_STATUS
      : MOTION_VIDEO_PAUSED_STATUS;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <video
        key={mediaKey}
        ref={videoRef}
        src={src}
        aria-label={name ?? "סרטון תרגיל"}
        className={cn("absolute inset-0 h-full w-full cursor-pointer", fitClass)}
        muted
        playsInline
        preload={autoplayAllowed ? "auto" : "metadata"}
        onClick={onSurfaceActivate}
        onError={onError}
      />

      {/*
        Bottom-left, opposite the `bottom-3 right-3` "הראה עוד" affordance the
        details sheet overlays on the same frame, so the two never collide.
      */}
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isPlaying}
        aria-label={controlLabel}
        className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-[11px] font-medium backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Shape, not colour, carries the state: replay ↺ / pause ❚❚ / play ▶. */}
        {runComplete ? (
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        ) : isPlaying ? (
          <Pause className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Play className="h-3.5 w-3.5" aria-hidden />
        )}
        <span>{controlShort}</span>
      </button>

      <span aria-live="polite" className="sr-only">
        {statusText}
      </span>
    </div>
  );
}
