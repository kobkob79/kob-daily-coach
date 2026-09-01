import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [appShell, coachChatShell, chatComposer, conversationFlow] = await Promise.all([
  readFile(new URL("src/components/AppShell.tsx", root), "utf8"),
  readFile(new URL("src/components/coach/CoachChatShell.tsx", root), "utf8"),
  readFile(new URL("src/components/coach/conversations/ChatComposer.tsx", root), "utf8"),
  readFile(
    new URL("src/lib/advisor-core/server/advisor-conversation-flow.server.ts", root),
    "utf8",
  ),
]);

assert.match(appShell, /isAdvisorChat \? "h-\[100dvh\] overflow-y-hidden"/);
assert.match(appShell, /min-h-0 overflow-hidden/);

// Landscape (short viewport): app chrome collapses so the message area keeps usable height.
const shortHeight = /\[@media\(max-height:560px\)\]/;
assert.match(appShell, shortHeight);
assert.match(appShell, /isAdvisorChat && "\[@media\(max-height:560px\)\]:hidden"/);
assert.equal(appShell.match(/\[@media\(max-height:560px\)\]:hidden/g)?.length, 2); // header + bottom nav
assert.match(appShell, /pb-\[var\(--viora-nav-pad\)\]/);
assert.match(appShell, /"--viora-nav-pad": `\$\{hideBottomNav \? 16 : navHeight \+ 16\}px`/);
assert.match(coachChatShell, shortHeight);
assert.doesNotMatch(coachChatShell, /max-h-\[\d/);
assert.doesNotMatch(chatComposer, /h-\[|max-h-/);

assert.match(coachChatShell, /flex h-full min-h-0 min-w-0 flex-col/);
assert.match(coachChatShell, /relative min-h-0 min-w-0 flex-1/);
assert.match(coachChatShell, /h-full min-h-0 min-w-0 space-y-3 overflow-x-hidden overflow-y-auto/);
assert.doesNotMatch(coachChatShell, /max-h-\[56dvh\]/);
assert.match(coachChatShell, /showNewMessageChip && <NewMessageChip/);
assert.match(coachChatShell, /forceFollowRef\.current \|\| nearBottomRef\.current/);
assert.match(coachChatShell, /<AdvisorContextConsentCard/);
assert.match(coachChatShell, /<AdvisorContextNotice flags=\{contextFlags\}/);
assert.match(coachChatShell, /quotaState === "loading"/);
assert.match(coachChatShell, /quotaState === "error"/);
assert.match(coachChatShell, /<ChatFailureState/);

assert.match(chatComposer, /flex shrink-0 gap-2/);
assert.doesNotMatch(chatComposer, /sticky bottom-/);
assert.match(chatComposer, /if \(!clean \|\| disabled \|\| isLoading\) return/);

assert.match(conversationFlow, /clientRequestId/);
assert.match(conversationFlow, /assistantForTurn/);

console.log(
  "Advisor chat mobile viewport regression: PASS (single message scroller, reachable composer, follow-latest guard, consent/quota/error coverage, no auto-send contract change)",
);
