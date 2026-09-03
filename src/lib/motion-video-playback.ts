/**
 * Motion Video playback policy — pure helpers shared by the controller hook
 * (`useMotionVideoPlayback`), the `MotionVideo` component and the framework-free
 * `node --test` suites.
 *
 * Policy (VIORA-MOTION-VIDEO-FIVE-CYCLE-ADDENDUM-001): a playback session is
 * capped at five completed video cycles. There is no native `<video loop>`;
 * each completion event is counted and the element is restarted after cycles
 * 1–4 and left visibly stopped after cycle 5. A sixth cycle never begins.
 * Manual replay after the cap starts a fresh session with a full allowance of
 * five; there is no unlimited playback mode.
 */

/** Maximum completed video cycles per playback session. The single source of
 *  truth for the finite-loop limit — never inline the number elsewhere. */
export const MOTION_VIDEO_MAX_CYCLES = 5;

/**
 * Decide what to do when the `<video>` fires its completion event, given how
 * many cycles have now completed (the cycle that just ended included). Driven
 * by completion events only — never timers — so a dropped frame or a throttled
 * tab can never miscount.
 *
 *   resolveCycleEnd(1..4) -> "restart"
 *   resolveCycleEnd(5)     -> "complete"  (stop; no sixth cycle)
 *   resolveCycleEnd(6+)    -> "complete"  (defensive: still never restarts)
 */
export function resolveCycleEnd(cyclesCompleted: number): "restart" | "complete" {
  return cyclesCompleted >= MOTION_VIDEO_MAX_CYCLES ? "complete" : "restart";
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
