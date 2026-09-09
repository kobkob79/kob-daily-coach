/**
 * Run with: node --test src/lib/community-share-studio-no-ai-call.test.ts
 *
 * Codex review finding 4 (VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1): opening
 * the Workout Share Studio — including a direct URL visit, a refresh, or
 * revisiting an already-shared workout — must never trigger a new OpenAI
 * call. There's no component-render harness in this repo to mount the
 * route and spy on network calls, so this proves the same guarantee at
 * the source level: the route only ever imports the read-only
 * getWorkoutDebriefSnapshot (which itself never touches OpenAI — see
 * coach-debrief-persistence.server.ts, a pure DB read/write module with no
 * "openai"/"coach-debrief.server" import), and never imports or calls the
 * AI-generating generateCoachDebrief at all.
 *
 * Deliberately lives in src/lib, not src/routes — a stray .test.ts inside
 * the routes tree risks confusing TanStack Router's file-based route
 * generator.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const routeSource = readFileSync(
  fileURLToPath(
    new URL(
      "../routes/_authenticated/workouts.session.$sessionId.debrief.share.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);

const persistenceSource = readFileSync(
  fileURLToPath(new URL("./coach-debrief-persistence.server.ts", import.meta.url)),
  "utf8",
);

test("the Share Studio route never references generateCoachDebrief", () => {
  assert.doesNotMatch(routeSource, /generateCoachDebrief/);
});

test("the Share Studio route uses the read-only getWorkoutDebriefSnapshot", () => {
  assert.match(routeSource, /getWorkoutDebriefSnapshot/);
});

test("the debrief snapshot persistence module never imports the OpenAI-calling coach-debrief.server module", () => {
  assert.doesNotMatch(persistenceSource, /coach-debrief\.server/);
  assert.doesNotMatch(persistenceSource, /["']openai["']/);
});
