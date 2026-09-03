/**
 * Motion Video playback policy — pure helpers shared by the controller hook
 * (`useMotionVideoPlayback`), the `MotionVideo` component and the framework-free
 * `node --test` suites.
 *
 * Policy (VIORA-MOTION-VIDEO-THREE-CYCLE-AUTOPLAY-001): a normal autoplay run
 * is exactly three complete cycles. There is no native `<video loop>`; each
 * `ended` event is counted and the element is restarted after cycles 1 and 2
 * and left stopped after cycle 3. Cycle 4 never starts automatically.
 */

/** A Motion Video autoplay run is exactly this many complete cycles. */
export const MOTION_VIDEO_CYCLE_TARGET = 3;

/**
 * Decide what to do when the `<video>` fires `ended`, given how many cycles
 * have now completed (the cycle that just ended included). Driven by `ended`
 * events only — never timers — so a dropped frame or a throttled tab can never
 * miscount.
 *
 *   resolveCycleEnd(1) -> "restart"   (after cycle 1)
 *   resolveCycleEnd(2) -> "restart"   (after cycle 2)
 *   resolveCycleEnd(3) -> "complete"  (stop; no cycle 4)
 *   resolveCycleEnd(4) -> "complete"  (defensive: still never restarts)
 */
export function resolveCycleEnd(cyclesCompleted: number): "restart" | "complete" {
  return cyclesCompleted >= MOTION_VIDEO_CYCLE_TARGET ? "complete" : "restart";
}

/**
 * `HTMLMediaElement.readyState` is "ready enough to begin playback" once it
 * reaches `HAVE_FUTURE_DATA` (3). Used to decide whether the first autoplay
 * attempt can fire immediately or must wait for a readiness event.
 */
export const MEDIA_READY_STATE = 3;

export function isMediaReady(readyState: number): boolean {
  return readyState >= MEDIA_READY_STATE;
}
