/**
 * Run with: node --test src/lib/motion-video-playback-controller.test.ts
 *
 * EXECUTABLE behavioural regression for VIORA-MOTION-VIDEO-FIVE-CYCLE-REVIEW-
 * FIXES-001. These tests drive `MotionVideoPlaybackController` against a fake
 * media element that records every `addEventListener` / `removeEventListener`
 * call and lets the test fire real events. Nothing here is a source-text
 * assertion — each test exercises actual listener attach/detach, cycle
 * counting and pause/play behaviour.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { MOTION_VIDEO_MAX_CYCLES } from "./motion-video-playback.ts";
import {
  MotionVideoPlaybackController,
  type MotionVideoControllerOptions,
  type MotionVideoPlaybackSnapshot,
} from "./motion-video-playback-controller.ts";

/** Drains the microtask queue so `.then` / `.catch` chains settle. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

class FakeVideoElement {
  paused = true;
  ended = false;
  currentTime = 0;
  readyState = 4; // HAVE_ENOUGH_DATA
  playCalls = 0;
  pauseCalls = 0;
  addCalls = 0;
  removeCalls = 0;

  #playMode: "resolve" | "reject" | "hang" = "resolve";
  #listeners = new Map<string, Set<() => void>>();

  setPlayMode(mode: "resolve" | "reject" | "hang") {
    this.#playMode = mode;
  }

  addEventListener(type: string, fn: () => void) {
    this.addCalls += 1;
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(fn);
  }

  removeEventListener(type: string, fn: () => void) {
    this.removeCalls += 1;
    this.#listeners.get(type)?.delete(fn);
  }

  countFor(type: string) {
    return this.#listeners.get(type)?.size ?? 0;
  }

  totalListeners() {
    let total = 0;
    for (const set of this.#listeners.values()) total += set.size;
    return total;
  }

  handlersFor(type: string) {
    return [...(this.#listeners.get(type) ?? [])];
  }

  play(): Promise<void> {
    this.playCalls += 1;
    if (this.#playMode === "hang") {
      return new Promise<void>(() => {}); // never settles
    }
    if (this.#playMode === "reject") {
      return Promise.reject(new Error("NotAllowedError"));
    }
    if (this.paused || this.ended) {
      this.paused = false;
      this.ended = false;
      this.#emit("play");
      this.#emit("playing");
    }
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
    if (!this.paused) {
      this.paused = true;
      this.#emit("pause");
    }
  }

  /** Test-only: simulate the media reaching its natural end. */
  endCycle(): void {
    this.ended = true;
    this.paused = true;
    this.#emit("ended");
  }

  /** Test-only: simulate a readiness event. */
  becomeReady(type: "loadeddata" | "canplay" = "canplay"): void {
    this.readyState = 4;
    this.#emit(type);
  }

  #emit(type: string) {
    for (const fn of [...(this.#listeners.get(type) ?? [])]) fn();
  }
}

function makeController(overrides: Partial<MotionVideoControllerOptions> = {}) {
  const states: MotionVideoPlaybackSnapshot[] = [];
  const controller = new MotionVideoPlaybackController({
    onChange: (snapshot) => states.push({ ...snapshot }),
    hydrated: false,
    prefersReducedMotion: false,
    ...overrides,
  });
  const last = () => states[states.length - 1] ?? controller.getSnapshot();
  return { controller, states, last };
}

const CORE_EVENTS = ["play", "playing", "pause", "ended"] as const;

test("element A receives the play/playing/pause/ended listeners", () => {
  const { controller } = makeController({ hydrated: true });
  const a = new FakeVideoElement();

  controller.setElement(a);

  for (const evt of CORE_EVENTS) assert.equal(a.countFor(evt), 1, `A has one ${evt} listener`);
});

test("replacing element A with B moves every listener from A to B and pauses A", () => {
  const { controller } = makeController({ hydrated: true });
  const a = new FakeVideoElement();
  const b = new FakeVideoElement();

  controller.setElement(a);
  const aPausesBefore = a.pauseCalls;
  controller.setElement(b);

  assert.equal(a.totalListeners(), 0, "A fully detached");
  assert.ok(a.pauseCalls > aPausesBefore, "A paused during hand-off");
  for (const evt of CORE_EVENTS) assert.equal(b.countFor(evt), 1, `B has one ${evt} listener`);
});

test("stale `ended` events from the replaced element A do not affect element B", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const a = new FakeVideoElement();
  const b = new FakeVideoElement();

  controller.setElement(a);
  await flush();
  // Capture A's actual ended handlers *before* the swap.
  const staleEndedHandlers = a.handlersFor("ended");
  assert.equal(staleEndedHandlers.length, 1);

  controller.setElement(b);
  await flush();
  const bPlaysBefore = b.playCalls;

  // Fire the captured stale handlers directly - proves the element-identity
  // guard, independent of removeEventListener having worked.
  for (const handler of staleEndedHandlers) handler();
  await flush();

  assert.equal(last().runComplete, false, "B session not completed by A's events");
  assert.equal(b.playCalls, bPlaysBefore, "B not restarted by A's events");
});

test("normal user: autoplays only after hydration", async () => {
  const { controller, last } = makeController(); // hydrated: false
  const el = new FakeVideoElement();

  controller.setElement(el);
  assert.equal(el.playCalls, 0, "no autoplay before hydration");

  controller.setHydrated(true);
  await flush();

  assert.equal(el.playCalls, 1);
  assert.equal(last().isPlaying, true);
});

test("Reduced Motion user: no autoplay; manual start still runs a full five-cycle session", async () => {
  const { controller, last } = makeController({ hydrated: true, prefersReducedMotion: true });
  const el = new FakeVideoElement();

  controller.setElement(el);
  await flush();
  assert.equal(el.playCalls, 0, "Reduced Motion never autoplays");
  assert.equal(last().isPlaying, false);

  controller.toggle(); // explicit manual start
  await flush();
  assert.equal(el.playCalls, 1);

  for (let cycle = 1; cycle <= MOTION_VIDEO_MAX_CYCLES; cycle += 1) {
    el.endCycle();
    await flush();
  }
  assert.equal(last().runComplete, true);
  assert.equal(el.playCalls, 1 + (MOTION_VIDEO_MAX_CYCLES - 1), "4 restarts inside the RM session");
});

test("cycles 1-4 restart the element; the fifth completed cycle stops it; a sixth cannot begin", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const el = new FakeVideoElement();

  controller.setElement(el);
  await flush();
  const playsAfterAutostart = el.playCalls; // 1

  for (let cycle = 1; cycle <= MOTION_VIDEO_MAX_CYCLES; cycle += 1) {
    el.endCycle();
    await flush();
  }

  assert.equal(last().runComplete, true, "stops after the fifth cycle");
  assert.equal(
    el.playCalls,
    playsAfterAutostart + (MOTION_VIDEO_MAX_CYCLES - 1),
    "exactly four restarts (cycles 1-4)",
  );

  const playsBeforeSixth = el.playCalls;
  el.endCycle(); // stray sixth completion event
  await flush();
  assert.equal(el.playCalls, playsBeforeSixth, "no sixth cycle play");
  assert.equal(last().runComplete, true);
});

test("duplicate `ended` events at the cap are ignored", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const el = new FakeVideoElement();
  controller.setElement(el);
  await flush();

  for (let cycle = 1; cycle <= MOTION_VIDEO_MAX_CYCLES; cycle += 1) {
    el.endCycle();
    await flush();
  }
  const playsAtCap = el.playCalls;

  el.endCycle();
  el.endCycle();
  el.endCycle();
  await flush();

  assert.equal(el.playCalls, playsAtCap, "no extra restarts from duplicate events");
  assert.equal(last().runComplete, true);
});

test("manual replay after the cap starts a fresh five-cycle session (three sessions in a row)", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const el = new FakeVideoElement();

  controller.setElement(el);
  await flush();

  for (let session = 1; session <= 3; session += 1) {
    const playsAtSessionStart = el.playCalls;
    for (let cycle = 1; cycle <= MOTION_VIDEO_MAX_CYCLES; cycle += 1) {
      el.endCycle();
      await flush();
    }
    assert.equal(last().runComplete, true, `session ${session} stops after five cycles`);
    assert.equal(
      el.playCalls - playsAtSessionStart,
      MOTION_VIDEO_MAX_CYCLES - 1,
      `session ${session}: four restarts`,
    );

    const playsAfterComplete = el.playCalls;
    el.endCycle();
    await flush();
    assert.equal(el.playCalls, playsAfterComplete, `session ${session}: no sixth cycle`);

    if (session < 3) {
      controller.toggle(); // Replay
      await flush();
      assert.equal(last().runComplete, false, `session ${session + 1} started fresh`);
    }
  }
});

test("pausing and resuming keeps the intermediate cycle count (no fresh allowance)", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const el = new FakeVideoElement();

  controller.setElement(el);
  await flush();

  el.endCycle(); // cycle 1 -> restart
  await flush();
  el.endCycle(); // cycle 2 -> restart
  await flush();

  const playsBeforePause = el.playCalls; // autostart + 2 restarts = 3
  controller.toggle(); // pause (element is playing)
  assert.equal(el.paused, true);
  controller.toggle(); // resume
  await flush();
  assert.equal(el.paused, false);
  assert.equal(el.playCalls, playsBeforePause + 1, "resume is a bare play(), not a restart batch");

  el.endCycle(); // cycle 3
  await flush();
  el.endCycle(); // cycle 4
  await flush();
  el.endCycle(); // cycle 5 -> complete
  await flush();

  assert.equal(last().runComplete, true, "completes at five total, proving the count survived");
});

test("enabling Reduced Motion during playback pauses the current element immediately", async () => {
  const { controller } = makeController({ hydrated: true });
  const el = new FakeVideoElement();

  controller.setElement(el);
  await flush();
  assert.equal(el.paused, false, "autoplaying");

  const pausesBefore = el.pauseCalls;
  controller.setReducedMotion(true);

  assert.equal(el.paused, true);
  assert.equal(el.pauseCalls, pausesBefore + 1);
});

test("disabling Reduced Motion does not automatically resume playback", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const el = new FakeVideoElement();

  controller.setElement(el);
  await flush();
  controller.setReducedMotion(true);
  const playsAfterPause = el.playCalls;

  controller.setReducedMotion(false);
  await flush();

  assert.equal(el.paused, true, "still paused");
  assert.equal(el.playCalls, playsAfterPause, "no play() call on Reduced Motion off");
  assert.equal(last().isPlaying, false);
});

test("Reduced Motion set before hydration suppresses autoplay for good", async () => {
  const { controller, last } = makeController(); // hydrated false
  const el = new FakeVideoElement();

  controller.setElement(el);
  controller.setReducedMotion(true);
  controller.setHydrated(true); // hydration completes while RM is on
  await flush();
  assert.equal(el.playCalls, 0);

  controller.setReducedMotion(false); // user turns RM off later
  await flush();
  assert.equal(el.playCalls, 0, "no delayed autoplay after RM off");
  assert.equal(last().isPlaying, false);
});

test("rejected play() leaves the UI in an accurate paused state", async () => {
  const { controller, last } = makeController();
  const el = new FakeVideoElement();
  el.setPlayMode("reject");

  controller.setElement(el);
  controller.setHydrated(true);
  await flush();

  assert.equal(el.paused, true);
  assert.equal(last().isPlaying, false);
  assert.equal(last().runComplete, false);
});

test("a blocked automatic autoplay is silent — never sets playbackError", async () => {
  const { controller, last } = makeController();
  const el = new FakeVideoElement();
  el.setPlayMode("reject");

  controller.setElement(el);
  controller.setHydrated(true);
  await flush();

  assert.equal(last().playbackError, false, "autoplay-policy block is not a real error");
});

test("a tap during an in-flight play() attempt still (re)starts playback, not a silent pause", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const el = new FakeVideoElement();
  el.setPlayMode("hang"); // autostart's play() call never settles or fires events

  controller.setElement(el); // autostart attempt in flight
  await flush();
  assert.equal(last().isPlaying, false, "no playing event has fired yet");

  // Real browsers flip `paused` to false synchronously inside play(), well
  // before the "playing" event fires once buffering actually completes — the
  // fake's "hang" mode doesn't model that side effect, so set it directly to
  // reproduce the window a real tap can land in.
  el.paused = false;

  const playsBeforeTap = el.playCalls;
  controller.toggle(); // user taps "play" while still buffering
  assert.equal(el.pauseCalls, 0, "must not silently pause a video that never actually played");
  assert.equal(el.playCalls, playsBeforeTap + 1, "toggle attempts play() again, not pause()");
});

test("a user-initiated play() rejection (tap while paused) sets playbackError", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const el = new FakeVideoElement();

  controller.setElement(el); // autostart succeeds
  await flush();
  controller.toggle(); // pause
  assert.equal(el.paused, true);

  el.setPlayMode("reject");
  controller.toggle(); // user tries to resume — this play() call rejects
  await flush();

  assert.equal(last().playbackError, true);
  assert.equal(last().isPlaying, false);
});

test("a real play() after a playbackError clears it", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const el = new FakeVideoElement();

  controller.setElement(el);
  await flush();
  controller.toggle(); // pause
  el.setPlayMode("reject");
  controller.toggle(); // rejected resume
  await flush();
  assert.equal(last().playbackError, true);

  el.setPlayMode("resolve");
  controller.toggle(); // retry — succeeds
  await flush();

  assert.equal(last().playbackError, false);
  assert.equal(last().isPlaying, true);
});

test("a rejected replay after the five-cycle cap sets playbackError", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const el = new FakeVideoElement();

  controller.setElement(el);
  await flush();
  for (let cycle = 1; cycle <= MOTION_VIDEO_MAX_CYCLES; cycle += 1) {
    el.endCycle();
    await flush();
  }
  assert.equal(last().runComplete, true);

  el.setPlayMode("reject");
  controller.toggle(); // replay attempt rejects
  await flush();

  assert.equal(last().playbackError, true);
  assert.equal(last().runComplete, false, "a fresh session was started before the rejection");
});

test("setElement() clears a stale playbackError from the previous media", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const a = new FakeVideoElement();
  const b = new FakeVideoElement();

  controller.setElement(a);
  await flush();
  controller.toggle(); // pause
  a.setPlayMode("reject");
  controller.toggle(); // rejected resume
  await flush();
  assert.equal(last().playbackError, true);

  controller.setElement(b);
  await flush();

  assert.equal(last().playbackError, false);
});

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test("a user-initiated play() that never settles sets playbackError once the watchdog elapses", async () => {
  const { controller, last } = makeController({ hydrated: true, playTimeoutMs: 15 });
  const el = new FakeVideoElement();

  controller.setElement(el);
  await flush();
  controller.toggle(); // pause
  el.setPlayMode("hang"); // play() never resolves or rejects
  controller.toggle(); // user tries to resume
  await flush();
  assert.equal(last().playbackError, false, "not yet - still within the timeout window");

  await wait(30);
  assert.equal(last().playbackError, true, "the stalled attempt is now treated as failed");
});

test("the watchdog does not fire once real playback starts before it elapses", async () => {
  const { controller, last } = makeController({ hydrated: true, playTimeoutMs: 30 });
  const el = new FakeVideoElement();

  controller.setElement(el);
  await flush();
  controller.toggle(); // pause
  controller.toggle(); // resume - resolves and fires play/playing synchronously
  await flush();
  assert.equal(last().isPlaying, true);

  await wait(50); // well past the watchdog window
  assert.equal(last().playbackError, false, "already playing - the watchdog must not fire");
});

test("setElement() cancels a pending watchdog from the previous media", async () => {
  const { controller, last } = makeController({ hydrated: true, playTimeoutMs: 15 });
  const a = new FakeVideoElement();
  const b = new FakeVideoElement();

  controller.setElement(a);
  await flush();
  controller.toggle(); // pause
  a.setPlayMode("hang");
  controller.toggle(); // watchdog armed on A
  await flush();

  controller.setElement(b); // swap before A's watchdog fires
  await flush();
  await wait(30);

  assert.equal(last().playbackError, false, "B's fresh session is untouched by A's stale watchdog");
});

test("a hung automatic first run stays silent - the watchdog is user-gesture only", async () => {
  const { controller, last } = makeController({ hydrated: true, playTimeoutMs: 15 });
  const el = new FakeVideoElement();
  el.setPlayMode("hang");

  controller.setElement(el); // autostart attempt hangs
  await flush();
  await wait(30);

  assert.equal(last().playbackError, false, "autoplay is never surfaced, hung or not");
});

test("one early failed play() is retried exactly once when the element becomes ready", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const el = new FakeVideoElement();
  el.setPlayMode("reject");

  controller.setElement(el); // autostart attempt -> rejects -> waits for readiness
  await flush();
  assert.equal(el.playCalls, 1);

  el.setPlayMode("resolve");
  el.becomeReady("canplay"); // one retry fires
  await flush();
  assert.equal(el.playCalls, 2, "exactly one retry");
  assert.equal(last().isPlaying, true);

  el.setPlayMode("reject");
  el.becomeReady("canplay"); // readiness listener already gone -> no further retry
  await flush();
  assert.equal(el.playCalls, 2, "no second retry");
});

test("not-ready element waits for a readiness event, then autostarts, with balanced listeners", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const el = new FakeVideoElement();
  el.readyState = 1; // HAVE_METADATA - not ready

  controller.setElement(el);
  assert.equal(el.countFor("canplay"), 1);
  assert.equal(el.countFor("loadeddata"), 1);
  assert.equal(el.playCalls, 0, "no play until ready");

  el.becomeReady("canplay");
  await flush();

  assert.equal(el.countFor("canplay"), 0, "readiness listeners cleared");
  assert.equal(el.countFor("loadeddata"), 0);
  assert.equal(el.playCalls, 1);
  assert.equal(last().isPlaying, true);

  controller.dispose();
  assert.equal(el.addCalls, el.removeCalls, "add/remove balanced through the readiness path");
});

test("component unmount (dispose) pauses the current element and removes every listener", async () => {
  const { controller } = makeController({ hydrated: true });
  const a = new FakeVideoElement();
  const b = new FakeVideoElement();

  controller.setElement(a);
  controller.setElement(b); // replacement, then unmount
  await flush();

  const bPausesBefore = b.pauseCalls;
  controller.dispose();

  assert.ok(b.pauseCalls > bPausesBefore, "current element paused on unmount");
  assert.equal(b.totalListeners(), 0, "current element fully detached");
  assert.equal(a.totalListeners(), 0, "replaced element stayed detached");
});

test("listener add/remove counts stay balanced across replace + five cycles + dispose", async () => {
  const { controller } = makeController({ hydrated: true });
  const a = new FakeVideoElement();
  const b = new FakeVideoElement();

  controller.setElement(a);
  await flush();
  for (let cycle = 1; cycle <= MOTION_VIDEO_MAX_CYCLES; cycle += 1) {
    a.endCycle();
    await flush();
  }

  controller.setElement(b);
  await flush();
  for (let cycle = 1; cycle <= MOTION_VIDEO_MAX_CYCLES; cycle += 1) {
    b.endCycle();
    await flush();
  }

  controller.dispose();

  assert.equal(a.addCalls, a.removeCalls, "A balanced");
  assert.equal(b.addCalls, b.removeCalls, "B balanced");
  assert.equal(a.totalListeners(), 0);
  assert.equal(b.totalListeners(), 0);
});

test("Strict-Mode-style ref churn (node -> null -> node) leaves exactly one listener set", () => {
  const { controller } = makeController({ hydrated: true });
  const el = new FakeVideoElement();

  controller.setElement(el); // attach
  controller.setElement(null); // detach
  controller.setElement(el); // re-attach

  for (const evt of CORE_EVENTS) assert.equal(el.countFor(evt), 1, `single ${evt} listener`);
  assert.equal(el.totalListeners(), CORE_EVENTS.length);

  controller.dispose();
  assert.equal(el.totalListeners(), 0);
});

test("replacement element stops after its own five cycles (count reset on setElement)", async () => {
  const { controller, last } = makeController({ hydrated: true });
  const a = new FakeVideoElement();
  const b = new FakeVideoElement();

  controller.setElement(a);
  await flush();
  a.endCycle(); // A: cycle 1
  await flush();
  a.endCycle(); // A: cycle 2
  await flush();

  controller.setElement(b); // swap mid-session
  await flush();

  const bPlaysStart = b.playCalls;
  for (let cycle = 1; cycle <= MOTION_VIDEO_MAX_CYCLES; cycle += 1) {
    b.endCycle();
    await flush();
  }
  assert.equal(last().runComplete, true, "B completes on its own fifth cycle");
  assert.equal(b.playCalls - bPlaysStart, MOTION_VIDEO_MAX_CYCLES - 1, "B: four restarts, not two");
});
