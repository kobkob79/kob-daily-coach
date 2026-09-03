/**
 * Run with: node --test src/hooks/usePrefersReducedMotion.test.ts
 *
 * Covers the shared, hydration-stable Reduced Motion reader. There is no React
 * render harness in this repo (see ExerciseMediaView.thumbnail.test.ts), so the
 * `useSyncExternalStore` wiring is checked at source level and the pure
 * snapshot helpers are exercised directly against a stubbed `window.matchMedia`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  getPrefersReducedMotion,
  getReducedMotionServerSnapshot,
  REDUCED_MOTION_QUERY,
} from "./usePrefersReducedMotion.ts";

const source = readFileSync(
  fileURLToPath(new URL("./usePrefersReducedMotion.ts", import.meta.url)),
  "utf8",
);

type Win = { matchMedia?: (q: string) => { matches: boolean } };

function withWindow(win: Win | undefined, run: () => void) {
  const g = globalThis as { window?: unknown };
  const had = "window" in g;
  const prev = g.window;
  if (win === undefined) delete g.window;
  else g.window = win;
  try {
    run();
  } finally {
    if (had) g.window = prev;
    else delete g.window;
  }
}

test("query targets prefers-reduced-motion: reduce", () => {
  assert.equal(REDUCED_MOTION_QUERY, "(prefers-reduced-motion: reduce)");
});

test("getPrefersReducedMotion is false without window / matchMedia (SSR-safe)", () => {
  withWindow(undefined, () => assert.equal(getPrefersReducedMotion(), false));
  withWindow({}, () => assert.equal(getPrefersReducedMotion(), false));
});

test("getPrefersReducedMotion mirrors the media query result", () => {
  let asked = "";
  withWindow(
    {
      matchMedia: (q: string) => {
        asked = q;
        return { matches: true };
      },
    },
    () => assert.equal(getPrefersReducedMotion(), true),
  );
  assert.equal(asked, "(prefers-reduced-motion: reduce)");

  withWindow({ matchMedia: () => ({ matches: false }) }, () =>
    assert.equal(getPrefersReducedMotion(), false),
  );
});

test("server snapshot is the hydration-safe default: preference not yet known", () => {
  // Used by React for the SSR render AND the first client (hydration) render,
  // so both agree before the live value is read.
  assert.equal(getReducedMotionServerSnapshot(), false);
});

test("the reader is a hydration-stable useSyncExternalStore subscription", () => {
  // Requirement 4: prefer useSyncExternalStore (or equivalent) over a
  // useState+useEffect read that would flip after the first paint.
  assert.match(source, /useSyncExternalStore/);
  assert.match(
    source,
    /useSyncExternalStore\(\s*subscribeReducedMotion,\s*getPrefersReducedMotion,\s*getReducedMotionServerSnapshot,?\s*\)/,
  );
  assert.doesNotMatch(source, /useEffect/, "the reader must not depend on a post-paint effect");
});

test("subscribe attaches and detaches a matchMedia change listener, SSR-guarded", () => {
  assert.match(source, /mql\.addEventListener\("change", onStoreChange\)/);
  assert.match(source, /return \(\) => mql\.removeEventListener\("change", onStoreChange\)/);
  // SSR / no-matchMedia: subscribe is a no-op, getSnapshot falls back to false.
  assert.match(source, /if \(!hasMatchMedia\(\)\) return \(\) => \{\};/);
  assert.match(source, /typeof window !== "undefined" && typeof window\.matchMedia === "function"/);
});

test("useIsHydrated: false on server + first render, true afterwards", () => {
  // getServerSnapshot -> false (SSR + hydration), getSnapshot -> true (client).
  assert.match(source, /function getHydratedClientSnapshot\(\): boolean \{\s*return true;/);
  assert.match(source, /function getHydratedServerSnapshot\(\): boolean \{\s*return false;/);
  assert.match(
    source,
    /export function useIsHydrated\(\): boolean \{\s*return useSyncExternalStore\(\s*subscribeHydration,\s*getHydratedClientSnapshot,\s*getHydratedServerSnapshot,?\s*\)/,
  );
});
