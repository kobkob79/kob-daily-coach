/**
 * useWorkoutTimer — persistent total-workout timer.
 *
 * Stores `{ sessionId, startedAt }` in localStorage so elapsed time is
 * recomputed from wall-clock. Survives navigation, reload, backgrounding,
 * lock screen. Cleared only when the session is finalized or discarded.
 */
import { useCallback, useEffect, useState } from "react";

const KEY = "viora:workout-timer";

interface Stored {
  sessionId: string;
  startedAt: number;
}

function read(): Stored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function write(v: Stored | null) {
  if (typeof window === "undefined") return;
  if (!v) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, JSON.stringify(v));
}

export function useWorkoutTimer(sessionId: string) {
  const [stored, setStored] = useState<Stored | null>(() => {
    const cur = read();
    if (cur && cur.sessionId === sessionId) return cur;
    return null;
  });
  const [now, setNow] = useState<number>(() => Date.now());

  // Auto-start on mount if not tracking this session
  useEffect(() => {
    const cur = read();
    if (!cur || cur.sessionId !== sessionId) {
      const v: Stored = { sessionId, startedAt: Date.now() };
      write(v);
      setStored(v);
    } else {
      setStored(cur);
    }
  }, [sessionId]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSec = stored ? Math.max(0, Math.floor((now - stored.startedAt) / 1000)) : 0;

  const stop = useCallback(() => {
    const cur = read();
    write(null);
    setStored(null);
    return cur ? Math.floor((Date.now() - cur.startedAt) / 1000) : 0;
  }, []);

  return { elapsedSec, stop, isRunning: !!stored };
}

export function formatTotalTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
