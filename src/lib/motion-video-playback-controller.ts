/**
 * MotionVideoPlaybackController — framework-agnostic finite-loop playback engine
 * for Motion Video (VIORA-MOTION-VIDEO-FIVE-CYCLE-REVIEW-FIXES-001).
 *
 * Why a plain class rather than inline effect code: the review found that
 * `useMotionVideoPlayback` bound its `play`/`playing`/`pause`/`ended` listeners
 * in effects that depended only on the stable `videoRef` object, so when
 * `MotionVideo` swapped the `<video>` DOM element (media change) the listeners
 * could stay attached to the *old* element. This controller owns one element
 * at a time behind `setElement()`, captures that exact element in every
 * handler and cleanup, and is driven from React by a **callback ref** — so
 * listeners always follow the real element and can be proven to do so with
 * executable tests (no DOM/React harness required).
 *
 * Behaviour (unchanged from the approved five-cycle spec):
 * - Normal users autoplay after hydration + media readiness; one early failed
 *   `play()` gets a single readiness-triggered retry; "autoplay done" is only
 *   recorded after a `play()` promise settles.
 * - No native `loop`. Each completion event is counted; the element restarts
 *   after cycles 1–4 and stops after cycle `MOTION_VIDEO_MAX_CYCLES` (5).
 *   Duplicate / stale completion events are ignored — never a sixth cycle.
 * - `toggle()` pauses ⇄ resumes a live session (cycle count retained) and
 *   replays a fresh five-cycle session once complete.
 * - Reduced Motion never autoplays; enabling it pauses immediately; disabling
 *   it never auto-resumes; explicit playback stays available (also 5-capped).
 * - `setElement()` (new media element) resets the session and rebinds
 *   listeners; `dispose()` (unmount) pauses the current element and detaches.
 * - A rejected automatic first run is a normal, silent autoplay-policy block
 *   (see above). A rejected *user-initiated* `play()` — from `toggle()` or a
 *   replay — is a real failure (e.g. unsupported codec) and sets
 *   `playbackError` so the UI can say so instead of staying a dead button.
 * - A user-initiated `play()` whose promise never settles at all (a stalled
 *   fetch, a source the browser never actually decodes) is treated the same
 *   way once `MOTION_VIDEO_USER_PLAY_TIMEOUT_MS` elapses with the element
 *   still paused — a tap is never met with silence either.
 */
import {
  isMediaReady,
  MOTION_VIDEO_MAX_CYCLES,
  MOTION_VIDEO_USER_PLAY_TIMEOUT_MS,
  resolveCycleEnd,
} from "./motion-video-playback.ts";

type MediaListener = () => void;

/** The slice of `HTMLVideoElement` this controller drives (kept minimal so
 *  tests can supply a fake element). `HTMLVideoElement` satisfies it. */
export interface ControllableMediaElement {
  readonly paused: boolean;
  readonly ended: boolean;
  currentTime: number;
  readonly readyState: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: MediaListener): void;
  removeEventListener(type: string, listener: MediaListener): void;
}

export interface MotionVideoPlaybackSnapshot {
  isPlaying: boolean;
  /** True once the five-cycle allowance is spent; the control shows "replay". */
  runComplete: boolean;
  /**
   * True once a user-initiated `play()` call (tap/click, not the automatic
   * first run) has rejected — e.g. an unsupported codec/container. Autoplay
   * being blocked by browser policy before any user gesture is normal and
   * never sets this; only a `play()` call made from `toggle()` does.
   */
  playbackError: boolean;
}

export interface MotionVideoControllerOptions {
  onChange: (snapshot: MotionVideoPlaybackSnapshot) => void;
  hydrated: boolean;
  prefersReducedMotion: boolean;
  /** Overrides `MOTION_VIDEO_USER_PLAY_TIMEOUT_MS` — test-only. */
  playTimeoutMs?: number;
}

/** Playback events mirrored into `isPlaying`. */
const PLAYBACK_EVENTS = ["play", "playing", "pause"] as const;
/** Media-element events meaning "there is now enough data to (re)start". */
const READINESS_EVENTS = ["loadeddata", "canplay"] as const;

type AutoState = "idle" | "attempting" | "retried" | "done";

export class MotionVideoPlaybackController {
  private readonly onChange: (snapshot: MotionVideoPlaybackSnapshot) => void;

  private element: ControllableMediaElement | null = null;
  /** Core listeners currently attached to `this.element`. */
  private coreHandlers: Array<[string, MediaListener]> = [];
  /** Pending one-shot readiness listener (element + handler), if any. */
  private readyElement: ControllableMediaElement | null = null;
  private readyHandler: MediaListener | null = null;

  private cycles = 0;
  private runComplete = false;
  private isPlaying = false;
  private playbackError = false;
  private autoState: AutoState = "idle";
  private hydrated: boolean;
  private reducedMotion: boolean;
  private disposed = false;
  private readonly playTimeoutMs: number;
  /** Watchdog for a user-initiated `play()` call whose promise never settles. */
  private playWatchdog: ReturnType<typeof setTimeout> | null = null;

  constructor(options: MotionVideoControllerOptions) {
    this.onChange = options.onChange;
    this.hydrated = options.hydrated;
    this.reducedMotion = options.prefersReducedMotion;
    this.playTimeoutMs = options.playTimeoutMs ?? MOTION_VIDEO_USER_PLAY_TIMEOUT_MS;
  }

  // ---- inputs from React -------------------------------------------------

  /**
   * Point the controller at the current media element (or `null`). Called from
   * a callback ref whose identity changes with `mediaKey`, so React invokes it
   * with `null` then the node whenever the media element is replaced.
   */
  setElement(next: ControllableMediaElement | null): void {
    if (next === this.element) return;

    // Detach + pause the outgoing element; drop every listener from it.
    this.detach();

    // Fresh playback session for the incoming element.
    this.cycles = 0;
    this.autoState = "idle";
    this.runComplete = false;
    this.isPlaying = false;
    this.playbackError = false;

    if (next && !this.disposed) {
      this.attach(next);
      this.syncPlaybackState(next);
      this.maybeAutoStart();
    }
    this.emit();
  }

  setHydrated(value: boolean): void {
    this.hydrated = value;
    this.maybeAutoStart();
  }

  setReducedMotion(value: boolean): void {
    const was = this.reducedMotion;
    this.reducedMotion = value;
    // Only the false→true transition pauses; never auto-resume on true→false.
    if (value && !was) this.element?.pause();
  }

  /** React unmount. Stops the current element and removes every listener. */
  dispose(): void {
    this.disposed = true;
    this.detach();
    this.emit();
  }

  // ---- user controls --------------------------------------------------

  toggle(): void {
    const el = this.element;
    if (!el) return;
    if (this.runComplete) {
      this.startFreshSession(el);
      return;
    }
    // Branch on the tracked `isPlaying` state, not the element's raw `paused`
    // property: `play()` sets `paused` to `false` synchronously (per spec),
    // well before the "playing" event actually fires — so while the automatic
    // first run is still buffering, `el.paused` already reads `false` even
    // though nothing is visibly playing yet. A tap during that window used to
    // read `el.paused` directly, take the "pause" branch, and immediately
    // re-pause an element that was never really playing — a silent no-op the
    // user saw as a dead button.
    if (this.isPlaying) {
      el.pause();
    } else {
      // Resume — the cycle count is deliberately left untouched. This call is
      // made directly from a click/tap handler, so unlike the automatic first
      // run a rejection here is a real failure (not an autoplay-policy block)
      // and is surfaced to the UI.
      this.startPlayWatchdog(el);
      void el.play().then(
        () => {},
        () => this.handlePlaybackError(el),
      );
    }
  }

  /** Tapping the video surface: same as the control button. */
  onSurfaceActivate(): void {
    this.toggle();
  }

  getSnapshot(): MotionVideoPlaybackSnapshot {
    return {
      isPlaying: this.isPlaying,
      runComplete: this.runComplete,
      playbackError: this.playbackError,
    };
  }

  // ---- element binding ----------------------------------------------

  private attach(el: ControllableMediaElement): void {
    const onPlaybackEvent: MediaListener = () => this.syncPlaybackState(el);
    const onEnded: MediaListener = () => this.handleEnded(el);

    const pairs: Array<[string, MediaListener]> = [
      ...PLAYBACK_EVENTS.map((type): [string, MediaListener] => [type, onPlaybackEvent]),
      ["ended", onEnded],
    ];
    for (const [type, fn] of pairs) el.addEventListener(type, fn);

    this.element = el;
    this.coreHandlers = pairs;
  }

  private detach(): void {
    this.clearReadiness();
    this.clearPlayWatchdog();
    const el = this.element;
    if (!el) return;
    for (const [type, fn] of this.coreHandlers) el.removeEventListener(type, fn);
    this.coreHandlers = [];
    el.pause();
    this.element = null;
  }

  private clearReadiness(): void {
    if (this.readyElement && this.readyHandler) {
      for (const evt of READINESS_EVENTS) {
        this.readyElement.removeEventListener(evt, this.readyHandler);
      }
    }
    this.readyElement = null;
    this.readyHandler = null;
  }

  private onceReady(el: ControllableMediaElement, run: () => void): void {
    this.clearReadiness();
    const handler: MediaListener = () => {
      this.clearReadiness();
      if (!this.disposed && el === this.element) run();
    };
    this.readyElement = el;
    this.readyHandler = handler;
    for (const evt of READINESS_EVENTS) el.addEventListener(evt, handler);
  }

  /**
   * A `play()` promise for a user-initiated attempt is expected to settle
   * almost immediately. If it's still pending once `playTimeoutMs` elapses —
   * a stalled fetch, a source the browser never actually decodes — treat the
   * still-paused element as failed too, so a tap is never met with silence.
   */
  private startPlayWatchdog(el: ControllableMediaElement): void {
    this.clearPlayWatchdog();
    this.playWatchdog = setTimeout(() => {
      this.playWatchdog = null;
      if (el === this.element && el.paused) this.handlePlaybackError(el);
    }, this.playTimeoutMs);
  }

  private clearPlayWatchdog(): void {
    if (this.playWatchdog !== null) {
      clearTimeout(this.playWatchdog);
      this.playWatchdog = null;
    }
  }

  // ---- playback state ----------------------------------------------

  private syncPlaybackState(el: ControllableMediaElement): void {
    if (el !== this.element) return; // event from a replaced element — ignore
    const next = !el.paused && !el.ended;
    if (next) this.clearPlayWatchdog();
    // Real playback proves the earlier failure is stale (e.g. a manual retry
    // that in fact succeeded after all) — clear it along with the state.
    const clearsError = next && this.playbackError;
    if (next === this.isPlaying && !clearsError) return;
    this.isPlaying = next;
    if (clearsError) this.playbackError = false;
    this.emit();
  }

  /** A user-initiated `play()` call rejected (or never settled) — surface it, don't swallow it. */
  private handlePlaybackError(el: ControllableMediaElement): void {
    if (el !== this.element) return;
    this.clearPlayWatchdog();
    this.playbackError = true;
    this.isPlaying = false;
    this.emit();
  }

  private handleEnded(el: ControllableMediaElement): void {
    if (el !== this.element) return; // stale element
    if (this.cycles >= MOTION_VIDEO_MAX_CYCLES) return; // duplicate / stale event

    this.cycles += 1;

    // The cap is the only stop condition here. "Enabling Reduced Motion pauses
    // immediately" is handled by setReducedMotion(); a manual Reduced-Motion
    // session is still limited to five cycles, not cut to one.
    if (resolveCycleEnd(this.cycles) === "complete") {
      this.runComplete = true;
      this.isPlaying = false;
      this.emit();
      return;
    }

    // Restart for the next cycle (1–4).
    try {
      el.currentTime = 0;
    } catch {
      /* not seekable yet — harmless */
    }
    void el.play().catch(() => {});
  }

  // ---- automatic first run -----------------------------------------

  private maybeAutoStart(): void {
    if (this.disposed || !this.hydrated || this.autoState !== "idle" || !this.element) return;

    // Reduced Motion: consume the automatic slot without ever playing, so a
    // later "Reduced Motion off" cannot trigger a delayed autoplay.
    if (this.reducedMotion) {
      this.autoState = "done";
      return;
    }

    const el = this.element;
    this.autoState = "attempting";
    if (isMediaReady(el.readyState)) this.autoAttempt(el);
    else this.onceReady(el, () => this.autoAttempt(el));
  }

  private autoAttempt(el: ControllableMediaElement): void {
    if (this.disposed || el !== this.element) return;
    this.cycles = 0;
    this.runComplete = false;
    this.emit();
    try {
      el.currentTime = 0;
    } catch {
      /* */
    }
    void el.play().then(
      () => this.settleAuto(el),
      () => this.retryAuto(el),
    );
  }

  private retryAuto(el: ControllableMediaElement): void {
    if (this.disposed || el !== this.element) return;
    if (this.autoState === "retried" || this.autoState === "done") return;
    this.autoState = "retried";
    this.onceReady(el, () => {
      if (this.disposed || el !== this.element) return;
      void el.play().then(
        () => this.settleAuto(el),
        () => this.settleAuto(el),
      );
    });
  }

  private settleAuto(el: ControllableMediaElement): void {
    if (el !== this.element) return;
    this.autoState = "done";
  }

  // ---- sessions ------------------------------------------------

  private startFreshSession(el: ControllableMediaElement): void {
    this.cycles = 0;
    this.runComplete = false;
    this.playbackError = false;
    this.emit();
    try {
      el.currentTime = 0;
    } catch {
      /* */
    }
    // Also click-triggered (replay control / tapping the surface once
    // complete) — a rejection here is just as real a failure as toggle()'s.
    this.startPlayWatchdog(el);
    void el.play().then(
      () => {},
      () => this.handlePlaybackError(el),
    );
  }

  private emit(): void {
    this.onChange({
      isPlaying: this.isPlaying,
      runComplete: this.runComplete,
      playbackError: this.playbackError,
    });
  }
}
