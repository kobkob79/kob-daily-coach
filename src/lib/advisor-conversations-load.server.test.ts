/**
 * Run with: node --test src/lib/advisor-conversations-load.server.test.ts
 *
 * VIORA-P0-MOBILE-RUNTIME-RECOVERY-REVIEW-FIXES-001 — this file previously
 * recreated getAdvisorConversationMessagesServer's load sequence in a local
 * function (loadConversationLikeTheRealHandler) and tested that copy. A
 * reviewer correctly rejected that: a locally recreated algorithm proves the
 * recreation is correct, not that the real production code is.
 *
 * The fix: the "safe optional-context loading" concern itself was extracted
 * into a real, exported production function —
 * `safeConversationContextFlags` in advisor-context-bridge.server.ts — which
 * getAdvisorConversationMessagesServer now calls directly (see the source
 * check below). That REAL function is exercised directly, with no
 * reimplementation, by advisor-context-bridge.server.test.ts's
 * "safeConversationContextFlags" describe block (all four advisors, a
 * failing source, the source itself throwing, consent off, sanitized
 * logging — see that file for the full behavioral coverage).
 *
 * getAdvisorConversationMessagesServer itself still can't be imported under
 * plain `node --test` — it's a TanStack Start server function
 * (`createServerFn`) and depends on the "@/..." path alias, both of which
 * only Vite resolves (see e.g. exercise-motion-draft.functions.ts for the
 * same documented limitation elsewhere in this codebase). What remains
 * here is a small structural guard — not a behavioral test — pinning that
 * the real handler actually wires in the real helper, so a future edit
 * can't quietly reintroduce an inline try/catch that drifts from it.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./advisor-conversations.functions.ts", import.meta.url)),
  "utf8",
);

function extractHandler(name: string, nextExportName: string): string {
  const start = source.indexOf(`export const ${name}`);
  assert.notEqual(start, -1, `${name} is defined`);
  const end = source.indexOf(`export const ${nextExportName}`);
  return source.slice(start, end === -1 ? undefined : end);
}

describe("getAdvisorConversationMessagesServer wires in the real safeConversationContextFlags helper", () => {
  const handler = extractHandler(
    "getAdvisorConversationMessagesServer",
    "renameAdvisorConversationServer",
  );

  test("calls the real exported helper, not a locally reimplemented try/catch", () => {
    assert.match(
      handler,
      /const \{ safeConversationContextFlags, createSupabaseAdvisorContextDataSource \} =/,
      "must import the real production helper from advisor-context-bridge.server",
    );
    assert.match(
      handler,
      /const contextFlags = await safeConversationContextFlags\(\s*userId,\s*conversation\.advisor_id,\s*createSupabaseAdvisorContextDataSource\(context\.supabase\),\s*\);/,
      "must call safeConversationContextFlags directly and await its result unconditionally — it never throws, so no try/catch is needed here",
    );
  });

  test("still returns NOT_FOUND before touching context or messages when the conversation doesn't exist", () => {
    assert.match(
      handler,
      /if \(!conversation\) return \{ status: "error", error: \{ code: "NOT_FOUND", retryable: false \} \};/,
    );
    const notFoundIndex = handler.indexOf('code: "NOT_FOUND"');
    const contextCallIndex = handler.indexOf("safeConversationContextFlags(");
    assert.ok(
      notFoundIndex < contextCallIndex,
      "the NOT_FOUND check happens before context is built",
    );
  });

  test("does not import or call the OpenAI/provider response generator — this path never touches a provider", () => {
    assert.doesNotMatch(handler, /generate-advisor-response|generateAdvisorResponse|openai/i);
  });

  test("messages are still fetched independently of the context-flags result", () => {
    assert.match(
      handler,
      /messages: await store\.listMessages\(/,
      "message history must not depend on how context building went",
    );
  });
});
