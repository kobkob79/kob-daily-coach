/**
 * exercise-motion-draft.functions.ts imports @tanstack/react-start and the
 * app's path alias (@/...), both of which require the Vite/TanStack build
 * pipeline to resolve - importing it directly under plain `node --test`
 * (no bundler) is not meaningful here. What IS meaningful and worth
 * regression-testing without a bundler is the one property that matters
 * most for security: that both exported server functions are wired to the
 * same `requireAdminAuth` middleware exercise-media-assignment.functions.ts
 * already relies on, so "Admin authorization rejection" is enforced by a
 * single, shared, already-relied-upon boundary rather than something new
 * and easy to accidentally omit on one of the two new endpoints.
 *
 * Run with: node --test src/lib/exercise-motion-draft.functions.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("./exercise-motion-draft.functions.ts", import.meta.url));
const source = readFileSync(path, "utf8");

test("imports requireAdminAuth from the existing, unmodified admin boundary", () => {
  assert.match(
    source,
    /import\s*\{\s*requireAdminAuth\s*\}\s*from\s*"@\/integrations\/supabase\/admin-middleware"/,
  );
});

test("getExerciseMotionDraftStatusServer is wired to requireAdminAuth", () => {
  const decl = source.match(
    /export const getExerciseMotionDraftStatusServer = createServerFn\([^)]*\)([\s\S]*?)\.handler/,
  );
  assert.ok(decl, "could not locate the getExerciseMotionDraftStatusServer declaration");
  assert.match(decl![1], /\.middleware\(\[requireAdminAuth\]\)/);
});

test("uploadExerciseMotionDraftServer is wired to requireAdminAuth", () => {
  const decl = source.match(
    /export const uploadExerciseMotionDraftServer = createServerFn\([^)]*\)([\s\S]*?)\.handler/,
  );
  assert.ok(decl, "could not locate the uploadExerciseMotionDraftServer declaration");
  assert.match(decl![1], /\.middleware\(\[requireAdminAuth\]\)/);
});

test("never imports or references the service-role client at module top level (only via dynamic import inside a handler, matching exercise-media-assignment.functions.ts's convention)", () => {
  assert.ok(
    !/^import .*client\.server/m.test(source),
    "client.server must only be reached via a dynamic import inside a handler, never a top-level import",
  );
  assert.match(source, /await import\("@\/integrations\/supabase\/client\.server"\)/);
});

test("the real HTTP upload path always passes verifiedFrameRate: null (never fabricates 30)", () => {
  assert.match(source, /verifiedFrameRate:\s*null/);
  assert.ok(
    !/verifiedFrameRate:\s*30/.test(source) &&
      !/verifiedFrameRate:\s*MOTION_VIDEO_REQUIRED_FRAME_RATE/.test(source),
    "the server function must never pass a fabricated frame rate",
  );
});

test("the ownership check on the Inbox source path matches the existing assignExerciseMediaServer convention", () => {
  assert.match(source, /inboxSourcePath\.startsWith\(`\$\{userId\}\/`\)/);
});
