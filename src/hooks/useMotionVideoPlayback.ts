/**
 * useMotionVideoPlayback — reliable autoplay + finite (five-cycle) playback
 * controller for `MotionVideo` (VIORA-MOTION-VIDEO-FIVE-CYCLE-ADDENDUM-001).
 *
 * Normal users:
 * - Waits for hydration and media readiness, then starts muted playback.
 * - The native infinite `loop` is gone; every completion event is counted and
 *   the element is restarted after cycles 1–4 and left stopped after cycle
 *   `MOTION_VIDEO_MAX_CYCLES` (5).
 * - A sixth cycle never starts automatically; duplicate/stale completion
 *   events are ignored once the cap is reached.
 * - One early failed `play()` gets a single readiness-triggered retry; nothing
 *   is marked "autoplay done" until a `play()` promise settles.
 * - `toggle()` pauses / resumes a live session (count retained) and replays
 *   once the session is complete; `onSurfaceActivate()` (tap the video) does
 *   the same, and starts a fresh five-cycle session after completion.
 *
 * Reduced Motion:
 * - Never autoplays. Enabling it pauses immediately; disabling it does not
 *   resume. Explicit playback via `toggle()` / `onSurfaceActivate()` stays
 *   available.
 *
 * Media identity:
 * - Cycle state resets when `mediaKey` changes, but not when only the signed
 *   URL is refreshed for the same `mediaKey`.
 *
 * Lifecycle: one `<video>` element, paused on unmount. `onError` is owned by
 * `MotionVideo` and untouched here.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  isMediaReady,
  MOTION_VIDEO_MAX_CYCLES,
  resolveCycleEnd,
} from "@/lib/motion-video-playback";

/** Media-element events that mean "there is now enough data to (re)start". */
const READINESS_EVENTS = ["loadeddata", "canplay"] as const;

export interface MotionVideoPlaybackOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** `useIsHydrated()` — the automatic first run waits for this. */
  hydrated: boolean;
  /** `usePrefersReducedMotion()` — suppresses the automatic first run. */
  prefersReducedMotion: boolean;
  /** Stable identity of the media item (Storage path), not the signed URL. */
  mediaKey: string;
}

export interface MotionVideoPlaybackState {
  isPlaying: boolean;
  /** True once the five-cycle allowance is spent; the control shows "replay". */
  runComplete: boolean;
  /** Pause ⇄ resume a live session (count retained); replay once complete. */
  toggle: () => void;
  /** Pointer handler for the video surface itself. */
  onSurfaceActivate: () => void;
}

export function useMotionVideoPlayback({
  videoRef,
  hydrated,
  prefersReducedMotion,
  mediaKey,
}: MotionVideoPlaybackOptions): MotionVideoPlaybackState {
  const [isPlaying, setIsPlaying] = useState(false);
  const [runComplete, setRunComplete] = useState(false);

  /** Completed cycles for the current session (0…5). Counted from the
   *  completion event only. */
  const cyclesRef = useRef(0);
  /**
   * Automatic-first-run state machine. "done"/"retried" block any further
   * automatic attempt; "done" is set only after a `play()` promise settles, so
   * a failed early attempt keeps the one readiness retry available.
   */
  const autoStartRef = useRef<"idle" | "attempting" | "retried" | "done">("idle");
  /** Latest Reduced Motion value, readable from the once-attached listeners. */
  const reducedMotionRef = useRef(prefersReducedMotion);
  reducedMotionRef.current = prefersReducedMotion;

  const startFreshRun = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    cyclesRef.current = 0;
    setRunComplete(false);
    try {
      video.currentTime = 0;
    } catch {
      /* not seekable yet — harmless */
    }
    void video.play().catch(() => {
      /* gesture/autoplay policy — the pause event keeps state honest */
    });
  }, [videoRef]);

  // Mirror the real element into `isPlaying` (covers autoplay-blocked, cycle
  // restarts, external pause, end-of-run).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => setIsPlaying(!video.paused && !video.ended);
    sync();
    video.addEventListener("play", sync);
    video.addEventListener("playing", sync);
    video.addEventListener("pause", sync);
    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("playing", sync);
      video.removeEventListener("pause", sync);
    };
  }, [videoRef]);

  // Cycle counter: driven purely by the `ended` completion event, never a
  // timer. Duplicate or stale `ended` events after the cap are ignored, so a
  // sixth cycle can never begin.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnded = () => {
      if (cyclesRef.current >= MOTION_VIDEO_MAX_CYCLES) return;
      cyclesRef.current += 1;
      const done = cyclesRef.current >= MOTION_VIDEO_MAX_CYCLES;
      if (resolveCycleEnd(cyclesRef.current) === "complete" || reducedMotionRef.current) {
        setRunComplete(done);
        return;
      }
      try {
        video.currentTime = 0;
      } catch {
        /* */
      }
      void video.play().catch(() => {});
    };
    video.addEventListener("ended", onEnded);
    return () => video.removeEventListener("ended", onEnded);
  }, [videoRef]);

  // Media *identity* changed → reset the run. A refreshed signed URL keeps the
  // same `mediaKey`, so this effect does not re-run for it and the count and
  // completion state are preserved.
  useEffect(() => {
    cyclesRef.current = 0;
    autoStartRef.current = "idle";
    setRunComplete(false);
    setIsPlaying(false);
  }, [mediaKey]);

  // Reliable automatic first run: once hydrated, wait for media readiness, then
  // attempt `play()` once, with a single readiness-triggered retry on failure.
  useEffect(() => {
    if (!hydrated || autoStartRef.current !== "idle") return;

    // Reduced Motion: consume the automatic slot without ever playing, so a
    // later "Reduced Motion off" does not trigger a delayed autoplay.
    if (prefersReducedMotion) {
      autoStartRef.current = "done";
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    autoStartRef.current = "attempting";
    let disposed = false;
    let pendingReady: (() => void) | null = null;

    const detachReady = () => {
      if (pendingReady) {
        for (const evt of READINESS_EVENTS) video.removeEventListener(evt, pendingReady);
        pendingReady = null;
      }
    };
    const onceReady = (run: () => void) => {
      pendingReady = () => {
        detachReady();
        if (!disposed) run();
      };
      for (const evt of READINESS_EVENTS) video.addEventListener(evt, pendingReady);
    };
    const settleDone = () => {
      if (!disposed) autoStartRef.current = "done";
    };
    const retryWhenReady = () => {
      if (disposed || autoStartRef.current === "retried" || autoStartRef.current === "done") return;
      autoStartRef.current = "retried";
      onceReady(() => void video.play().then(settleDone, settleDone));
    };
    const attempt = () => {
      if (disposed) return;
      cyclesRef.current = 0;
      setRunComplete(false);
      try {
        video.currentTime = 0;
      } catch {
        /* */
      }
      void video.play().then(settleDone, retryWhenReady);
    };

    if (isMediaReady(video.readyState)) attempt();
    else onceReady(attempt);

    return () => {
      disposed = true;
      detachReady();
      // Never committed to a real attempt (e.g. Strict Mode remount) → let the
      // next mount try again.
      if (autoStartRef.current === "attempting") autoStartRef.current = "idle";
    };
  }, [hydrated, prefersReducedMotion, mediaKey, videoRef]);

  // Reduced Motion turning on pauses immediately; turning it off never resumes.
  useEffect(() => {
    if (prefersReducedMotion) videoRef.current?.pause();
  }, [prefersReducedMotion, videoRef]);

  // Pause when the surface leaves / unmounts from the exercise view.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      video?.pause();
    };
  }, [videoRef]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (runComplete) {
      startFreshRun();
      return;
    }
    if (video.paused) {
      // Resume — the cycle count is deliberately left untouched.
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [runComplete, startFreshRun, videoRef]);

  const onSurfaceActivate = useCallback(() => {
    if (runComplete) startFreshRun();
    else toggle();
  }, [runComplete, startFreshRun, toggle]);

  return { isPlaying, runComplete, toggle, onSurfaceActivate };
}
