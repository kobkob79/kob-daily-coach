/**
 * Run with: node --test src/hooks/usePrefersReducedMotion.test.ts
 *
 * Covers the shared Reduced Motion reader. There is no React render harness in
 * this repo (see ExerciseMediaView.thumbnail.test.ts), so the hook body itself
 * is checked at source level and the synchronous helper is exercised directly
 * against a stubbed `window.matchMedia`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getPrefersReducedMotion, REDUCED_MOTION_QUERY } from "./usePrefersReducedMotion.ts";

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

test("the hook registers and cleans up a change listener and guards SSR", () => {
  assert.match(source, /addEventListener\("change", onChange\)/);
  assert.match(source, /removeEventListener\("change", onChange\)/);
  assert.match(source, /typeof window === "undefined"/);
});
