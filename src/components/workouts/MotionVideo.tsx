/**
 * MotionVideo — the shared Motion Video surface for an exercise.
 *
 * Wraps the single `<video>` element (muted / playsInline, same frame layout as
 * before) and adds one visible, keyboard- and touch-operable Play / Pause /
 * Replay control. All playback behaviour lives in `useMotionVideoPlayback`.
 *
 * Reduced Motion / hydration: the server and hydration render carry no autoplay
 * (fail-safe — no flash, no SSR/client mismatch). Once hydrated and the media
 * is ready, a normal user's video plays up to `MOTION_VIDEO_MAX_CYCLES` (5)
 * cycles and then stops (no native infinite `loop`); a Reduced Motion user's
 * stays paused. Enabling Reduced Motion pauses immediately; disabling it does
 * not resume.
 *
 * Replay: after the five-cycle allowance is spent the control switches to
 * "הפעל שוב"; tapping the video does the same. Pause/resume keeps the cycle
 * count.
 *
 * Lifecycle: exactly one `<video>`, bound through a **callback ref** so the
 * playback controller's listeners follow the real element when the media
 * changes; paused + detached on unmount. The signed-URL retry/error fallback is
 * unchanged — `onError` is forwarded straight to the `<video>` so
 * `ExerciseMediaView` can refetch once and then fall back to a still/placeholder.
 */
import { AlertTriangle, Pause, Play, RotateCcw } from "lucide-react";

import { useIsHydrated, usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useMotionVideoPlayback } from "@/hooks/useMotionVideoPlayback";
import { cn } from "@/lib/utils";

import {
  MOTION_VIDEO_COMPLETE_STATUS,
  MOTION_VIDEO_ERROR_STATUS,
  MOTION_VIDEO_PAUSE_LABEL,
  MOTION_VIDEO_PAUSE_SHORT,
  MOTION_VIDEO_PAUSED_STATUS,
  MOTION_VIDEO_PLAY_LABEL,
  MOTION_VIDEO_PLAY_SHORT,
  MOTION_VIDEO_PLAYING_STATUS,
  MOTION_VIDEO_REPLAY_LABEL,
  MOTION_VIDEO_REPLAY_SHORT,
  MOTION_VIDEO_RETRY_LABEL,
  MOTION_VIDEO_RETRY_SHORT,
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

  const { isPlaying, runComplete, playbackError, toggle, onSurfaceActivate, setVideoElement } =
    useMotionVideoPlayback({ hydrated, prefersReducedMotion });

  const controlLabel = playbackError
    ? MOTION_VIDEO_RETRY_LABEL
    : runComplete
      ? MOTION_VIDEO_REPLAY_LABEL
      : isPlaying
        ? MOTION_VIDEO_PAUSE_LABEL
        : MOTION_VIDEO_PLAY_LABEL;
  const controlShort = playbackError
    ? MOTION_VIDEO_RETRY_SHORT
    : runComplete
      ? MOTION_VIDEO_REPLAY_SHORT
      : isPlaying
        ? MOTION_VIDEO_PAUSE_SHORT
        : MOTION_VIDEO_PLAY_SHORT;
  const statusText = playbackError
    ? MOTION_VIDEO_ERROR_STATUS
    : runComplete
      ? MOTION_VIDEO_COMPLETE_STATUS
      : isPlaying
        ? MOTION_VIDEO_PLAYING_STATUS
        : MOTION_VIDEO_PAUSED_STATUS;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/*
        `key={mediaKey}` replaces the DOM node on a media change; the callback
        ref then fires null → newNode so the playback controller detaches its
        listeners from the old element and rebinds to the new one. A refreshed
        signed URL keeps the same key (same node), so the cycle count survives.
      */}
      <video
        key={mediaKey}
        ref={setVideoElement}
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
        A user tapped play/replay and the browser's play() call itself
        rejected (unsupported codec/container, dead source, ...) — the video
        surface would otherwise stay a silent black rectangle with a dead
        button. Say so, plainly, instead of leaving the tap unexplained.
      */}
      {playbackError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/90 px-4 text-center">
          <AlertTriangle className="h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-xs font-medium text-muted-foreground">{MOTION_VIDEO_ERROR_STATUS}</p>
        </div>
      )}

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
        {/* Shape, not colour, carries the state: retry ⚠ / replay ↺ / pause ❚❚ / play ▶. */}
        {playbackError ? (
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        ) : runComplete ? (
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
