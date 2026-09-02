/**
 * usePrefersReducedMotion — shared, hydration-stable reader for the OS
 * "Reduce motion" setting.
 *
 * Built on `useSyncExternalStore` so the server render and the first client
 * (hydration) render always agree on one snapshot; React then re-renders with
 * the live value once hydration completes, with no mismatch warning.
 *
 * `getReducedMotionServerSnapshot` returns `false` (preference not yet known),
 * and the companion `useIsHydrated()` lets a consumer keep motion gated until
 * the real browser preference has resolved — so Motion Video never autoplays
 * on the server or mid-hydration, not even briefly, for a Reduced Motion user.
 */
import { useSyncExternalStore } from "react";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function hasMatchMedia(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

/** Synchronous best-effort read; `false` on the server or without matchMedia. */
export function getPrefersReducedMotion(): boolean {
  return hasMatchMedia() ? window.matchMedia(REDUCED_MOTION_QUERY).matches : false;
}

function subscribeReducedMotion(onStoreChange: () => void): () => void {
  if (!hasMatchMedia()) return () => {};
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

/** Server + first-client (hydration) snapshot: preference not yet known. */
export function getReducedMotionServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getPrefersReducedMotion,
    getReducedMotionServerSnapshot,
  );
}

/** No external source to watch - hydration state flips exactly once. */
function subscribeHydration(): () => void {
  return () => {};
}
/** Stable snapshot getters (identity matters to useSyncExternalStore). */
function getHydratedClientSnapshot(): boolean {
  return true;
}
function getHydratedServerSnapshot(): boolean {
  return false;
}

/**
 * `false` during SSR and the first client render, `true` on every render after
 * hydration. Consumers use it to defer motion decisions until the real
 * preference is known, without risking an SSR/client hydration mismatch.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeHydration,
    getHydratedClientSnapshot,
    getHydratedServerSnapshot,
  );
}
