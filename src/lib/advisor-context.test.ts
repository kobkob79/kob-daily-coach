/**
 * Run with: node --test src/lib/advisor-context.test.ts
 *
 * Advisor Personal Context V1 — behavioral regression for the pure snapshot
 * layer (VIORA-ADVISOR-CONTEXT-CLEAN-ROOM-RECOVERY-001):
 *   • server-side integer age from a birth date, by calendar comparison;
 *   • the approved basic-profile block in the snapshot, with birth_date absent;
 *   • per-advisor selection reaching every active advisor;
 *   • ADVISOR_CONTEXT_MAX_CHARS budgeting cannot be bypassed by profile fields;
 *   • the Hebrew consent card: defaults off, enable/disable, keyboard + SR + RTL.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildAdvisorContextSnapshot,
  computeAgeFromBirthDate,
  selectAdvisorContext,
  type AdvisorContextInput,
  type ContextAdvisorId,
} from "./advisor-context-snapshot.ts";
import {
  ADVISOR_CONTEXT_MAX_CHARS,
  budgetAdvisorRequestContext,
} from "./advisor-core/server/advisor-context-budget.server.ts";

const consentCardSource = readFileSync(
  fileURLToPath(
    new URL("../components/coach/conversations/AdvisorContextConsentCard.tsx", import.meta.url),
  ),
  "utf8",
);

const ACTIVE_ADVISORS: ContextAdvisorId[] = ["adam", "daniel", "maya", "shiran"];

function baseInput(profile: AdvisorContextInput["profile"], now: Date): AdvisorContextInput {
  return { userId: "user-1", now, profile, timeline: [] };
}

describe("computeAgeFromBirthDate", () => {
  const now = new Date("2026-09-03T12:00:00.000Z");

  test("birthday already occurred this year", () => {
    assert.equal(computeAgeFromBirthDate("2000-01-15", now), 26);
  });

  test("birthday has not occurred yet this year", () => {
    assert.equal(computeAgeFromBirthDate("2000-12-31", now), 25);
  });

  test("birthday is today", () => {
    assert.equal(computeAgeFromBirthDate("2001-09-03", now), 25);
  });

  test("the day before the birthday is still the younger age", () => {
    assert.equal(computeAgeFromBirthDate("2001-09-04", now), 24);
  });

  test("leap-day birth date: not yet aged on Feb 28 of a non-leap year", () => {
    assert.equal(computeAgeFromBirthDate("2000-02-29", new Date("2025-02-28T12:00:00.000Z")), 24);
  });

  test("leap-day birth date: ages on Mar 1 of a non-leap year", () => {
    assert.equal(computeAgeFromBirthDate("2000-02-29", new Date("2025-03-01T12:00:00.000Z")), 25);
  });

  test("leap-day birth date: ages on Feb 29 of a leap year", () => {
    assert.equal(computeAgeFromBirthDate("2000-02-29", new Date("2024-02-29T12:00:00.000Z")), 24);
  });

  test("null / empty birth date → null (age is never guessed)", () => {
    assert.equal(computeAgeFromBirthDate(null, now), null);
    assert.equal(computeAgeFromBirthDate(undefined, now), null);
    assert.equal(computeAgeFromBirthDate("", now), null);
  });

  test("invalid birth date → null", () => {
    assert.equal(computeAgeFromBirthDate("not-a-date", now), null);
    assert.equal(computeAgeFromBirthDate("2020-13-40", now), null);
  });

  test("future birth date → null (never a negative age)", () => {
    assert.equal(computeAgeFromBirthDate("2030-01-01", now), null);
    assert.equal(computeAgeFromBirthDate("2026-09-04", now), null);
  });
});

describe("buildAdvisorContextSnapshot — approved basic profile block", () => {
  const now = new Date("2026-09-03T12:00:00.000Z");

  test("carries the approved fields as reported values (never inferred)", () => {
    const snapshot = buildAdvisorContextSnapshot(
      baseInput(
        { displayName: "Kobi", gender: "female", age: 34, heightCm: 172, currentWeightKg: 68 },
        now,
      ),
    );
    const profile = snapshot.facts.profile;
    assert.equal(profile.state, "known");
    assert.equal(profile.confidence, "reported");
    const value = profile.value as Record<string, unknown>;
    assert.equal(value.gender, "female");
    assert.equal(value.age, 34);
    assert.equal(value.heightCm, 172);
    assert.equal(value.currentWeightKg, 68);
  });

  test("missing values stay null — gender/age/height/weight are never inferred", () => {
    const snapshot = buildAdvisorContextSnapshot(baseInput({ displayName: "Only Name" }, now));
    const value = snapshot.facts.profile.value as Record<string, unknown>;
    assert.equal(value.displayName, "Only Name");
    assert.equal(value.gender, null);
    assert.equal(value.age, null);
    assert.equal(value.heightCm, null);
    assert.equal(value.currentWeightKg, null);
  });

  test("no profile at all → missing state, null value", () => {
    const snapshot = buildAdvisorContextSnapshot(baseInput(null, now));
    assert.equal(snapshot.facts.profile.state, "missing");
    assert.equal(snapshot.facts.profile.value, null);
  });

  test("birth_date can never reach the snapshot", () => {
    const snapshot = buildAdvisorContextSnapshot(
      baseInput({ displayName: "Kobi", age: 34, gender: "male" }, now),
    );
    const value = snapshot.facts.profile.value as Record<string, unknown>;
    assert.ok(!("birthDate" in value), "profile value has no birthDate key");
    assert.ok(!("birth_date" in value), "profile value has no birth_date key");
    assert.equal(
      Object.keys(value).sort().join(","),
      "age,currentWeightKg,displayName,gender,heightCm,timezone",
    );
    assert.ok(!JSON.stringify(snapshot).toLowerCase().includes("birth"));
  });
});

describe("selectAdvisorContext — advisor coverage and filtering", () => {
  const now = new Date("2026-09-03T12:00:00.000Z");
  const snapshot = buildAdvisorContextSnapshot(
    baseInput(
      { displayName: "Kobi", gender: "male", age: 40, heightCm: 180, currentWeightKg: 82 },
      now,
    ),
  );

  test("every active advisor receives the approved profile block", () => {
    for (const advisorId of ACTIVE_ADVISORS) {
      const selected = selectAdvisorContext(snapshot, advisorId);
      assert.ok(selected.facts.profile, `${advisorId} has a profile fact`);
      const value = selected.facts.profile!.value as Record<string, unknown>;
      assert.equal(value.gender, "male");
      assert.equal(value.age, 40);
      assert.equal(value.heightCm, 180);
      assert.equal(value.currentWeightKg, 82);
    }
  });

  test("advisor-specific filtering is preserved (each advisor gets only its own keys)", () => {
    const adam = Object.keys(selectAdvisorContext(snapshot, "adam").facts).sort();
    const shiran = Object.keys(selectAdvisorContext(snapshot, "shiran").facts).sort();
    assert.deepEqual(adam, ["bioDay", "profile", "recovery", "shift", "sleep"]);
    assert.deepEqual(shiran, ["bioDay", "goals", "hydration", "nutrition", "profile", "progress"]);
    // Adam is a sleep/recovery advisor — he must not receive nutrition or goals.
    assert.equal("nutrition" in selectAdvisorContext(snapshot, "adam").facts, false);
    assert.equal("goals" in selectAdvisorContext(snapshot, "adam").facts, false);
  });
});

describe("budget boundary", () => {
  const now = new Date("2026-09-03T12:00:00.000Z");
  const snapshot = buildAdvisorContextSnapshot(
    baseInput(
      { displayName: "Kobi", gender: "male", age: 40, heightCm: 180, currentWeightKg: 82 },
      now,
    ),
  );
  const profileContext = {
    generatedAt: snapshot.generatedAt,
    facts: { profile: snapshot.facts.profile } as Record<string, unknown>,
  };
  const shellSize = JSON.stringify({ generatedAt: snapshot.generatedAt, facts: {} }).length;

  test("the profile fact goes through budgeting like any other and is dropped when it does not fit", () => {
    // A budget that fits the shell but not the profile fact.
    const budgeted = budgetAdvisorRequestContext(profileContext, [], shellSize + 4);
    assert.equal(budgeted.truncated, true);
    assert.equal(
      "profile" in budgeted.context.facts,
      false,
      "profile is not exempt from the budget",
    );
    assert.ok(JSON.stringify(budgeted.context).length <= shellSize + 4);
  });

  test("a normal profile context stays within ADVISOR_CONTEXT_MAX_CHARS", () => {
    const selected = selectAdvisorContext(snapshot, "daniel");
    const budgeted = budgetAdvisorRequestContext(
      { generatedAt: selected.generatedAt, facts: selected.facts as Record<string, unknown> },
      [],
    );
    assert.equal(budgeted.truncated, false);
    assert.ok(JSON.stringify(budgeted.context).length <= ADVISOR_CONTEXT_MAX_CHARS);
  });

  test("an oversized higher-priority fact truncates and the output stays within budget", () => {
    const oversized = {
      generatedAt: snapshot.generatedAt,
      facts: {
        limitations: { state: "known", value: { note: "x".repeat(ADVISOR_CONTEXT_MAX_CHARS) } },
        profile: snapshot.facts.profile,
      } as Record<string, unknown>,
    };
    const budgeted = budgetAdvisorRequestContext(oversized, []);
    assert.equal(budgeted.truncated, true);
    assert.equal("limitations" in budgeted.context.facts, false);
    assert.ok(JSON.stringify(budgeted.context).length <= ADVISOR_CONTEXT_MAX_CHARS);
  });
});

describe("AdvisorContextConsentCard — Hebrew consent UI", () => {
  test("state is loaded from the existing Advisor Context consent server function", () => {
    assert.match(
      consentCardSource,
      /from "@\/lib\/advisor-context-consent\.functions"/,
      "uses the existing consent server functions",
    );
    assert.match(consentCardSource, /getAdvisorContextConsentServer\(\)/);
    assert.match(
      consentCardSource,
      /setAdvisorContextConsentServer\(\{ data: \{ enabled: next \} \}\)/,
    );
  });

  test("defaults to OFF when there is no stored preference or the load fails", () => {
    // useState starts null (loading), then resolves to enabled ?? false.
    assert.match(consentCardSource, /useState<boolean \| null>\(null\)/);
    assert.match(
      consentCardSource,
      /setEnabled\(result\.status === "success" \? result\.data\.enabled : false\)/,
    );
  });

  test("can be enabled and disabled from a single toggle", () => {
    assert.match(consentCardSource, /onClick=\{\(\) => void update\(!enabled\)\}/);
    assert.match(consentCardSource, /const update = async \(next: boolean\)/);
  });

  test("keyboard + screen-reader + RTL affordances are present", () => {
    // Native <button> → keyboard operable; aria-pressed reflects the state.
    assert.match(consentCardSource, /<Button\s+type="button"/);
    assert.match(consentCardSource, /aria-pressed=\{enabled\}/);
    // Status change and errors are announced.
    assert.match(consentCardSource, /aria-live="polite"/);
    assert.match(consentCardSource, /role="alert"/);
    // Decorative icon hidden; container is RTL.
    assert.match(consentCardSource, /aria-hidden/);
    assert.match(consentCardSource, /dir="rtl"/);
  });

  test("does not claim that chat history or My Insights are shared", () => {
    assert.doesNotMatch(consentCardSource, /היסטורי/); // chat history
    assert.doesNotMatch(consentCardSource, /תובנות/); // My Insights ("Insights")
    assert.doesNotMatch(consentCardSource, /My Insights/i);
  });
});
