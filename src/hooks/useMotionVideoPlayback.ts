/**
 * useMotionVideoPlayback — thin React binding around
 * `MotionVideoPlaybackController` (VIORA-MOTION-VIDEO-FIVE-CYCLE-REVIEW-FIXES-001).
 *
 * The controller owns all playback behaviour and, crucially, all media-element
 * event listeners. This hook only:
 * - creates one controller per mounted `MotionVideo`;
 * - exposes a stable **callback ref** (`setVideoElement`). `MotionVideo` gives
 *   the `<video>` a `key={mediaKey}`, so a media change makes React unmount the
 *   old node (`setVideoElement(null)` → controller detaches + pauses it) and
 *   mount a new one (`setVideoElement(node)` → controller rebinds + resets the
 *   session). A refreshed signed URL keeps the same key, so the node — and the
 *   cycle count — survive;
 * - forwards `hydrated` / `prefersReducedMotion` changes into the controller;
 * - pauses + detaches on unmount via `controller.dispose()`.
 *
 * There is deliberately no stable media-element ref object and no effect that
 * reads its `.current` — listener lifetime is tied to the real element through
 * the callback ref alone.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  MotionVideoPlaybackController,
  type MotionVideoPlaybackSnapshot,
} from "@/lib/motion-video-playback-controller";

export interface MotionVideoPlaybackOptions {
  /** `useIsHydrated()` — the automatic first run waits for this. */
  hydrated: boolean;
  /** `usePrefersReducedMotion()` — suppresses the automatic first run. */
  prefersReducedMotion: boolean;
}

export interface MotionVideoPlaybackState extends MotionVideoPlaybackSnapshot {
  /** Pause ⇄ resume a live session (count retained); replay once complete. */
  toggle: () => void;
  /** Pointer handler for the video surface itself. */
  onSurfaceActivate: () => void;
  /** Callback ref for the `<video>` element — attach as `ref={setVideoElement}`. */
  setVideoElement: (element: HTMLVideoElement | null) => void;
}

export function useMotionVideoPlayback({
  hydrated,
  prefersReducedMotion,
}: MotionVideoPlaybackOptions): MotionVideoPlaybackState {
  const [snapshot, setSnapshot] = useState<MotionVideoPlaybackSnapshot>({
    isPlaying: false,
    runComplete: false,
  });

  // One controller for the lifetime of this hook instance.
  const controllerRef = useRef<MotionVideoPlaybackController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = new MotionVideoPlaybackController({
      onChange: setSnapshot,
      hydrated,
      prefersReducedMotion,
    });
  }
  const controller = controllerRef.current;

  // Push reactive inputs in a fixed order: Reduced Motion first so the autoplay
  // decision in setHydrated() sees the correct value.
  useEffect(() => {
    controller.setReducedMotion(prefersReducedMotion);
    controller.setHydrated(hydrated);
  }, [controller, prefersReducedMotion, hydrated]);

  // Unmount → pause the current element and drop every listener.
  useEffect(() => {
    return () => controller.dispose();
  }, [controller]);

  // Stable callback ref. React calls it with `null` when the keyed `<video>`
  // unmounts and with the new node when the replacement mounts, so the
  // controller always follows the real element.
  const setVideoElement = useCallback(
    (element: HTMLVideoElement | null) => {
      controller.setElement(element);
    },
    [controller],
  );

  const toggle = useCallback(() => controller.toggle(), [controller]);
  const onSurfaceActivate = useCallback(() => controller.onSurfaceActivate(), [controller]);

  return {
    isPlaying: snapshot.isPlaying,
    runComplete: snapshot.runComplete,
    toggle,
    onSurfaceActivate,
    setVideoElement,
  };
}
