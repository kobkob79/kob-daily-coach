import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildAdvisorContextForUser } from "../src/lib/advisor-core/server/advisor-context-bridge.server.ts";
import { budgetAdvisorRequestContext } from "../src/lib/advisor-core/server/advisor-context-budget.server.ts";
import { boundCompletedAdvisorHistory } from "../src/lib/advisor-conversations.ts";

const now = new Date("2026-08-30T12:00:00.000Z");
let consent = false;
let loads = 0;
const source = {
  async hasConsent(userId) {
    assert.equal(userId, "owner-1");
    return consent;
  },
  async load(userId) {
    loads += 1;
    return {
      profile: { displayName: "Owner", timezone: "UTC" },
      goals: ["goal"],
      bioDay: null,
      shift: null,
      medical: [
        {
          conditionLabel: "approved condition",
          categoryLabel: "mobility",
          status: "active",
          severityBand: "medium",
          activityLimitation: "avoid impact",
          sensitivityCategory: null,
          recoveryStatus: "recovering",
          safetyGuidance: "stop on pain",
          effectiveDate: "2026-08-29",
          freshness: "current",
        },
      ],
      progress: {
        weightTrend: {
          direction: "down",
          changeKg: -1.2,
          fromDate: "2026-08-01",
          toDate: "2026-08-29",
        },
        bodyMeasurementTrends: [],
        observedAt: "2026-08-29",
        freshness: "current",
      },
      timelineInput: { timezone: "UTC" },
      conflicts: [],
    };
  },
};

// Consent absent: no personal source load and a safe disabled flag.
const absent = await buildAdvisorContextForUser("owner-1", "daniel", source, now, () => {});
assert.deepEqual(absent.context.facts, {});
assert.deepEqual(absent.contextFlags, [{ key: "contextSharing", state: "disabled" }]);
assert.equal(loads, 0);

// Consent granted and advisor-specific least privilege.
consent = true;
const daniel = await buildAdvisorContextForUser("owner-1", "daniel", source, now, () => {});
assert.equal(loads, 1);
assert.ok("medical" in daniel.context.facts);
assert.ok(!("progress" in daniel.context.facts));
const maya = await buildAdvisorContextForUser("owner-1", "maya", source, now, () => {});
assert.ok("medical" in maya.context.facts);
assert.ok("progress" in maya.context.facts);
const shiran = await buildAdvisorContextForUser("owner-1", "shiran", source, now, () => {});
assert.ok(!("medical" in shiran.context.facts));
assert.ok("progress" in shiran.context.facts);
const adam = await buildAdvisorContextForUser("owner-1", "adam", source, now, () => {});
assert.ok(!("medical" in adam.context.facts));
assert.ok(!("progress" in adam.context.facts));

// Revocation takes effect on the next build.
consent = false;
const revoked = await buildAdvisorContextForUser("owner-1", "maya", source, now, () => {});
assert.deepEqual(revoked.context.facts, {});
assert.equal(loads, 4);

// Budgeting preserves atomic facts and complete conversation turns.
const history = boundCompletedAdvisorHistory([
  { role: "user", content: "u1", turnId: "t1", ordinal: 1 },
  { role: "assistant", content: "a1", turnId: "t1", ordinal: 2 },
  { role: "user", content: "orphan", turnId: "t2", ordinal: 3 },
  { role: "user", content: "u3", turnId: "t3", ordinal: 4 },
  { role: "assistant", content: "a3", turnId: "t3", ordinal: 5 },
]);
assert.deepEqual(
  history.map((message) => message.content),
  ["u1", "a1", "u3", "a3"],
);
const budgeted = budgetAdvisorRequestContext(
  {
    generatedAt: now.toISOString(),
    facts: {
      limitations: { value: { safety: "stop" } },
      medical: { value: [{ conditionLabel: "condition" }] },
      goals: { value: ["goal"] },
      nutrition: { value: { payload: "x".repeat(200) } },
    },
  },
  history,
  260,
);
assert.ok("limitations" in budgeted.context.facts);
assert.ok("medical" in budgeted.context.facts);
assert.equal(budgeted.history.length % 2, 0);
assert.equal(budgeted.truncated, true);

const migration = await readFile(
  new URL("../supabase/migrations/20260830121234_advisor_context_preferences.sql", import.meta.url),
  "utf8",
);
assert.match(migration, /context_sharing_enabled boolean not null default false/i);
assert.match(migration, /primary key references auth\.users\(id\) on delete cascade/i);
assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
assert.match(migration, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);

const bridgeSource = await readFile(
  new URL("../src/lib/advisor-core/server/advisor-context-bridge.server.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(
  bridgeSource,
  /from\("vision_captures"|from\("body_photos"|image_path|storage_path|signedUrl/i,
);
assert.doesNotMatch(bridgeSource, /medical_issues"\)\s*\.select\([^)]*summary/i);
assert.doesNotMatch(bridgeSource, /weights_history"\)\s*\.select\([^)]*notes/i);
assert.doesNotMatch(bridgeSource, /body_measurements"\)\s*\.select\([^)]*notes/i);

const consentFunctions = await readFile(
  new URL("../src/lib/advisor-context-consent.functions.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(consentFunctions, /userId\s*:/);
assert.match(consentFunctions, /String\(context\.userId\)/);

const conversationFunctions = await readFile(
  new URL("../src/lib/advisor-conversations.functions.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(conversationFunctions, /contextFlags:\s*\[\]/);
assert.match(conversationFunctions, /buildAdvisorContextForUser/);

console.log(
  "Safe personal context regression: PASS (consent, ownership, allowlists, projections, revocation, budgeting, complete turns, reload flags)",
);
