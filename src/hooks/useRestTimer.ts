/**
 * useRestTimer — a per-session rest timer.
 *
 * State is stored in `sessionStorage` keyed by session id, so backgrounding
 * the tab, locking the phone, or navigating between exercises never loses
 * accuracy: elapsed time is recomputed from wall-clock (`Date.now() -
 * startedAt`). The timer keeps running when it reaches zero and counts up
 * in overtime until explicitly stopped by completing the next set.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface StoredTimer {
  startedAt: number;
  plannedSec: number;
  exerciseId: string;
  setNumber: number;
  finishedAt?: number;
}

function key(sessionId: string) {
  return `viora:rest:${sessionId}`;
}

function read(sessionId: string): StoredTimer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key(sessionId));
    return raw ? (JSON.parse(raw) as StoredTimer) : null;
  } catch {
    return null;
  }
}

function write(sessionId: string, val: StoredTimer | null) {
  if (typeof window === "undefined") return;
  if (!val) sessionStorage.removeItem(key(sessionId));
  else sessionStorage.setItem(key(sessionId), JSON.stringify(val));
}

const SOUND_KEY = "viora:rest:sound";

/** Whether the end-of-rest chime is enabled (opt-out, persisted locally). */
export function isRestSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SOUND_KEY) !== "0";
}

export function setRestSoundEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SOUND_KEY, enabled ? "1" : "0");
}

/** Short two-tone chime via WebAudio — no asset, no autoplay policy issues. */
function playChime() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [880, 1174].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.18);
    });
    window.setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* ignore */
  }
}

export interface RestTimerState {
  active: boolean;
  elapsedSec: number;
  remainingSec: number;
  overtimeSec: number;
  plannedSec: number;
  phase: "idle" | "running" | "overtime";
  soundEnabled: boolean;
  toggleSound: () => void;
  start: (opts: { plannedSec: number; exerciseId: string; setNumber: number }) => void;
  addSeconds: (delta: number) => void;
  stop: () => { plannedSec: number; actualSec: number; overtimeSec: number } | null;
  clear: () => void;
}


export function useRestTimer(sessionId: string): RestTimerState {
  const [stored, setStored] = useState<StoredTimer | null>(() => read(sessionId));
  const [now, setNow] = useState<number>(() => Date.now());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const vibrateRef = useRef(false);
  const soundRef = useRef(false);

  // Sound preference is client-only; read after mount to stay SSR-safe.
  useEffect(() => {
    const enabled = isRestSoundEnabled();
    setSoundEnabled(enabled);
    soundRef.current = enabled;
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      setRestSoundEnabled(next);
      soundRef.current = next;
      return next;
    });
  }, []);

  // Rehydrate when session changes
  useEffect(() => {
    setStored(read(sessionId));
  }, [sessionId]);

  // Tick while active
  useEffect(() => {
    if (!stored) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [stored]);

  // Fire vibrate + chime + notification once when reaching zero
  useEffect(() => {
    if (!stored) return;
    const elapsed = Math.floor((now - stored.startedAt) / 1000);
    const remaining = stored.plannedSec - elapsed;
    if (remaining <= 0 && !vibrateRef.current) {
      vibrateRef.current = true;
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          (navigator as Navigator).vibrate?.([200, 80, 200]);
        }
        if (soundRef.current) playChime();
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("Viora", { body: "המנוחה הסתיימה — לסט הבא" });
        }
      } catch {
        /* ignore */
      }
    }
  }, [stored, now]);


  const elapsed = stored ? Math.max(0, Math.floor((now - stored.startedAt) / 1000)) : 0;
  const remaining = stored ? Math.max(0, stored.plannedSec - elapsed) : 0;
  const overtime = stored ? Math.max(0, elapsed - stored.plannedSec) : 0;

  const start = useCallback<RestTimerState["start"]>(
    ({ plannedSec, exerciseId, setNumber }) => {
      const val: StoredTimer = {
        startedAt: Date.now(),
        plannedSec,
        exerciseId,
        setNumber,
      };
      write(sessionId, val);
      setStored(val);
      vibrateRef.current = false;
      // Request notification permission on first start (best-effort)
      try {
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "default"
        ) {
          Notification.requestPermission().catch(() => {});
        }
      } catch {
        /* ignore */
      }
    },
    [sessionId],
  );

  const addSeconds = useCallback(
    (delta: number) => {
      setStored((prev) => {
        if (!prev) return prev;
        const next: StoredTimer = { ...prev, plannedSec: Math.max(0, prev.plannedSec + delta) };
        write(sessionId, next);
        return next;
      });
    },
    [sessionId],
  );

  const stop = useCallback(() => {
    const current = read(sessionId);
    if (!current) return null;
    const actual = Math.max(0, Math.floor((Date.now() - current.startedAt) / 1000));
    const over = Math.max(0, actual - current.plannedSec);
    write(sessionId, null);
    setStored(null);
    vibrateRef.current = false;
    return { plannedSec: current.plannedSec, actualSec: actual, overtimeSec: over };
  }, [sessionId]);

  const clear = useCallback(() => {
    write(sessionId, null);
    setStored(null);
    vibrateRef.current = false;
  }, [sessionId]);

  return {
    active: !!stored,
    elapsedSec: elapsed,
    remainingSec: remaining,
    overtimeSec: overtime,
    plannedSec: stored?.plannedSec ?? 0,
    phase: !stored ? "idle" : remaining > 0 ? "running" : "overtime",
    soundEnabled,
    toggleSound,
    start,
    addSeconds,
    stop,
    clear,
  };
}

export function formatClock(sec: number): string {
  const s = Math.abs(Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
