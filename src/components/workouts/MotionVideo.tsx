/**
 * MotionVideo — the shared Motion Video surface for an exercise.
 *
 * Wraps the single looping `<video>` element (muted / loop / playsInline, the
 * same frame layout as before) and adds one visible, keyboard- and
 * touch-operable Play/Pause control.
 *
 * Reduced Motion / hydration: the video stays paused with no `autoPlay`
 * attribute on the server and through hydration (fail-safe — no autoplay flash,
 * no SSR/client mismatch). Once the browser preference resolves post-hydration,
 * a normal user's video starts once; a Reduced Motion user's stays paused.
 * Turning Reduced Motion on later pauses playback; turning it off does NOT
 * auto-resume.
 *
 * Lifecycle: the element is paused on unmount (leaving the exercise view).
 * Exactly one `<video>` is rendered, so there is never a duplicate playback
 * loop.
 *
 * The signed-URL retry/error fallback is unchanged: `onError` is forwarded
 * straight to the `<video>` so `ExerciseMediaView` can refetch once and then
 * fall back to a still/placeholder.
 */
import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useIsHydrated, usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";

import {
  MOTION_VIDEO_PAUSE_LABEL,
  MOTION_VIDEO_PAUSE_SHORT,
  MOTION_VIDEO_PAUSED_STATUS,
  MOTION_VIDEO_PLAY_LABEL,
  MOTION_VIDEO_PLAY_SHORT,
  MOTION_VIDEO_PLAYING_STATUS,
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
  // Only ever true after hydration, and never for a Reduced Motion user - so
  // the server/hydration render carries no `autoPlay` attribute at all.
  const autoplayAllowed = hydrated && !prefersReducedMotion;
  const videoRef = useRef<HTMLVideoElement>(null);
  // Fail-safe: paused until the real browser preference has resolved. Source of
  // truth after that is the element itself, mirrored here for rendering.
  const [isPlaying, setIsPlaying] = useState(false);

  // Keep React state aligned with the real element (autoplay blocked, loop
  // restart, external pause, …) so the control always shows the true state.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => setIsPlaying(!video.paused);
    sync();
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
    };
  }, []);

  // First time the real client preference is known (post-hydration), a normal
  // user's video starts playing exactly once. A Reduced Motion user's does not.
  const didAutostartRef = useRef(false);
  useEffect(() => {
    if (!hydrated || didAutostartRef.current) return;
    didAutostartRef.current = true;
    if (!prefersReducedMotion) {
      void videoRef.current?.play().catch(() => {
        /* autoplay/gesture policy — the pause event keeps state honest */
      });
    }
  }, [hydrated, prefersReducedMotion]);

  // Reduced Motion turning on mid-playback pauses the video; turning it off
  // never auto-resumes — the user restarts it with the control.
  useEffect(() => {
    if (prefersReducedMotion) videoRef.current?.pause();
  }, [prefersReducedMotion]);

  // Pause when the video leaves / unmounts from the exercise view.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      video?.pause();
    };
  }, []);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {
        /* autoplay/gesture policy — the pause event keeps state honest */
      });
    } else {
      video.pause();
    }
  }, []);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <video
        key={mediaKey}
        ref={videoRef}
        src={src}
        aria-label={name ?? "סרטון תרגיל"}
        className={cn("absolute inset-0 h-full w-full", fitClass)}
        autoPlay={autoplayAllowed}
        loop
        muted
        playsInline
        preload="metadata"
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
        aria-label={isPlaying ? MOTION_VIDEO_PAUSE_LABEL : MOTION_VIDEO_PLAY_LABEL}
        className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-[11px] font-medium backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Shape, not colour, carries the state: ▶ triangle vs ❚❚ bars. */}
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Play className="h-3.5 w-3.5" aria-hidden />
        )}
        <span>{isPlaying ? MOTION_VIDEO_PAUSE_SHORT : MOTION_VIDEO_PLAY_SHORT}</span>
      </button>

      <span aria-live="polite" className="sr-only">
        {isPlaying ? MOTION_VIDEO_PLAYING_STATUS : MOTION_VIDEO_PAUSED_STATUS}
      </span>
    </div>
  );
}
