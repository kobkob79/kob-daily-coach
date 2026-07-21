/**
 * useWorkoutTimer — persistent total-workout timer.
 *
 * Uses workout_sessions.started_at as the source of truth. localStorage is
 * only a cache for the current session id + database start timestamp.
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

export function clearWorkoutTimer(sessionId?: string) {
  const cur = read();
  if (!sessionId || cur?.sessionId === sessionId) write(null);
}

export function useWorkoutTimer(
  sessionId: string,
  startedAtIso?: string | null,
  isActive = true,
) {
  const [stored, setStored] = useState<Stored | null>(() => {
    const cur = read();
    if (cur && cur.sessionId === sessionId) return cur;
    return null;
  });
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!isActive || !startedAtIso) {
      clearWorkoutTimer(sessionId);
      setStored(null);
      return;
    }
    const startedAt = new Date(startedAtIso).getTime();
    if (!Number.isFinite(startedAt)) {
      setStored(null);
      return;
    }
    const v: Stored = { sessionId, startedAt };
    write(v);
    setStored(v);
  }, [sessionId, startedAtIso, isActive]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSec = stored ? Math.max(0, Math.floor((now - stored.startedAt) / 1000)) : 0;

  const stop = useCallback(() => {
    const cur = read();
    clearWorkoutTimer(sessionId);
    setStored(null);
    return cur ? Math.floor((Date.now() - cur.startedAt) / 1000) : 0;
  }, [sessionId]);

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
