import { describe, test } from "node:test";
import assert from "node:assert";
import { buildAdvisorContextSnapshot } from "./advisor-context-snapshot";
import type { AdvisorContextInput } from "./advisor-context-snapshot";

describe("buildAdvisorContextSnapshot", () => {
  test("preserves reported gender, height, and weight", () => {
    const input: AdvisorContextInput = {
      userId: "test-user",
      now: new Date("2024-01-01T12:00:00.000Z"),
      profile: {
        displayName: "Kobi",
        gender: "male",
        heightCm: 180,
        currentWeightKg: 80,
      },
      timeline: [],
    };
    const snapshot = buildAdvisorContextSnapshot(input);
    const profile = snapshot.facts.profile.value as Record<string, unknown>;
    assert.strictEqual(profile.gender, "male");
    assert.strictEqual(profile.heightCm, 180);
    assert.strictEqual(profile.currentWeightKg, 80);
    assert.strictEqual(snapshot.facts.profile.confidence, "reported");
  });

  test("handles age properly", () => {
    const input: AdvisorContextInput = {
      userId: "test-user",
      now: new Date("2024-01-01T12:00:00.000Z"),
      profile: {
        age: 34,
      },
      timeline: [],
    };
    const snapshot = buildAdvisorContextSnapshot(input);
    const profile = snapshot.facts.profile.value as Record<string, unknown>;
    assert.strictEqual(profile.age, 34);
  });

  test("missing profile fields are mapped to nulls, state is known if any profile data exists", () => {
    const input: AdvisorContextInput = {
      userId: "test-user",
      now: new Date("2024-01-01T12:00:00.000Z"),
      profile: {
        displayName: "Missing Data",
      },
      timeline: [],
    };
    const snapshot = buildAdvisorContextSnapshot(input);
    const profile = snapshot.facts.profile.value as Record<string, unknown>;
    assert.strictEqual(profile.gender, null);
    assert.strictEqual(profile.age, null);
    assert.strictEqual(profile.heightCm, null);
    assert.strictEqual(profile.currentWeightKg, null);
  });
});
