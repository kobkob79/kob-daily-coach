/**
 * usePrefersReducedMotion — shared reader for the OS "Reduce motion" setting.
 *
 * Mirrors the `(prefers-reduced-motion: reduce)` media query and stays in sync
 * when the user flips the setting while the app is open. SSR-safe: resolves to
 * `false` when `window`/`matchMedia` is unavailable, matching the framework-free
 * hook style already used by `use-mobile.tsx`.
 *
 * Consumers use this to decide whether Motion Video may autoplay. When it
 * returns `true` the video must render paused and only start on an explicit
 * user action.
 */
import { useEffect, useState } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Synchronous best-effort read; `false` on the server or without matchMedia. */
export function getPrefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] =
    useState<boolean>(getPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setPrefersReducedMotion(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return prefersReducedMotion;
}
