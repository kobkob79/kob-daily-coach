/**
 * useCountUp — animates a numeric value from 0 (or previous) to `target`
 * over `duration` ms using a cubic ease-out. Uses requestAnimationFrame,
 * SSR-safe (returns target immediately when window is missing).
 */
import { useEffect, useRef, useState } from "react";

export function useCountUp(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      setValue(target);
      return;
    }
    const start = performance.now();
    const startVal = from.current;
    const delta = target - startVal;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(startVal + delta * ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else from.current = target;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}
