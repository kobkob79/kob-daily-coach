/**
 * Run with: node --test src/lib/coach-debrief-safety.test.ts
 *
 * Coach Debrief safe-error-handling (VIORA-COACH-DEBRIEF-SAFE-RECOVERY-002):
 *   • every category's user-facing message is one of the approved static
 *     strings — never a raw provider/error message, never contains a
 *     correlation id's own randomness leaking anything else;
 *   • correlation ids are short, random-looking, and carry no request data;
 *   • the Advisor error-code → Debrief category mapping is total and
 *     doesn't fall through to a wrong bucket for any known code;
 *   • the runtime shape validator accepts exactly what the JSON schema
 *     declares required, and fails closed (returns null, never throws or
 *     guesses) for anything else — refusal, empty, or malformed output.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDebriefFailure,
  COACH_DEBRIEF_JSON_SCHEMA,
  createCorrelationId,
  DEBRIEF_SAFE_MESSAGES,
  type DebriefErrorCategory,
  mapAdvisorErrorCodeToDebriefCategory,
  parseCoachDebriefResponseText,
  validateCoachDebriefShape,
} from "./coach-debrief-safety.ts";
import type { AdvisorCoreErrorCode } from "./advisor-core/response.ts";

const ALL_CATEGORIES: DebriefErrorCategory[] = [
  "NOT_CONFIGURED",
  "AUTH_FAILED",
  "BILLING_OR_QUOTA",
  "RATE_LIMITED",
  "TIMEOUT",
  "MODEL_ACCESS",
  "INVALID_REQUEST",
  "INVALID_RESPONSE",
  "PROVIDER_UNAVAILABLE",
];

const VALID_DEBRIEF = {
  greeting: "סיימת אימון חזק היום.",
  paragraphs: ["פסקה ראשונה.", "פסקה שנייה."],
  highlights: ["שיא אישי בסקוואט"],
  nextFocus: "התמקד בטכניקה בסט הבא.",
  recovery: "ישן טוב הלילה.",
  nutrition: null,
  hydration: null,
};

describe("DEBRIEF_SAFE_MESSAGES", () => {
  test("every category has a non-empty approved Hebrew message", () => {
    for (const category of ALL_CATEGORIES) {
      const message = DEBRIEF_SAFE_MESSAGES[category];
      assert.equal(typeof message, "string");
      assert.ok(message.trim().length > 0, `${category} must have a message`);
    }
  });

  test("messages never look like a raw provider error (no status codes, stack frames, or English gateway wording)", () => {
    for (const category of ALL_CATEGORIES) {
      const message = DEBRIEF_SAFE_MESSAGES[category];
      assert.doesNotMatch(message, /\b[45]\d{2}\b/, `${category} message must not embed an HTTP status`);
      assert.doesNotMatch(message, /at .+:\d+:\d+/, `${category} message must not look like a stack frame`);
      assert.doesNotMatch(
        message,
        /openai|api key|invalid_api_key|insufficient_quota|rate_limit/i,
        `${category} message must not name the provider or its error codes`,
      );
    }
  });
});

describe("buildDebriefFailure", () => {
  test("returns the approved message and a correlation id for every category, never a raw string", () => {
    for (const category of ALL_CATEGORIES) {
      const failure = buildDebriefFailure(category, "dbg_fixedforthistest");
      assert.equal(failure.status, "error");
      assert.equal(failure.category, category);
      assert.equal(failure.message, DEBRIEF_SAFE_MESSAGES[category]);
      assert.equal(failure.correlationId, "dbg_fixedforthistest");
    }
  });

  test("generates its own correlation id when none is supplied", () => {
    const a = buildDebriefFailure("TIMEOUT");
    const b = buildDebriefFailure("TIMEOUT");
    assert.notEqual(a.correlationId, b.correlationId);
  });
});

describe("createCorrelationId", () => {
  test("is short, prefixed, and carries no separators that could smuggle structured data", () => {
    for (let i = 0; i < 20; i++) {
      const id = createCorrelationId();
      assert.match(id, /^dbg_[a-z0-9]{8,20}$/i);
    }
  });

  test("is not sequential / predictable across calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createCorrelationId()));
    assert.equal(ids.size, 50);
  });
});

describe("mapAdvisorErrorCodeToDebriefCategory", () => {
  const cases: Array<[AdvisorCoreErrorCode, DebriefErrorCategory]> = [
    ["OPENAI_AUTH_FAILURE", "AUTH_FAILED"],
    ["OPENAI_INSUFFICIENT_QUOTA", "BILLING_OR_QUOTA"],
    ["OPENAI_MODEL_ACCESS_FAILURE", "MODEL_ACCESS"],
    ["OPENAI_RATE_LIMIT", "RATE_LIMITED"],
    ["OPENAI_BAD_REQUEST", "INVALID_REQUEST"],
    ["MISSING_OPENAI_CONFIGURATION", "NOT_CONFIGURED"],
  ];

  for (const [code, expected] of cases) {
    test(`${code} → ${expected}`, () => {
      assert.equal(mapAdvisorErrorCodeToDebriefCategory(code), expected);
    });
  }

  test("unknown/unexpected codes fail closed to PROVIDER_UNAVAILABLE rather than crashing", () => {
    assert.equal(mapAdvisorErrorCodeToDebriefCategory("OPENAI_PROVIDER_FAILURE"), "PROVIDER_UNAVAILABLE");
    assert.equal(
      mapAdvisorErrorCodeToDebriefCategory("SOME_FUTURE_CODE" as AdvisorCoreErrorCode),
      "PROVIDER_UNAVAILABLE",
    );
  });
});

describe("validateCoachDebriefShape — schema/validator parity", () => {
  test("accepts a fully valid debrief", () => {
    const result = validateCoachDebriefShape(VALID_DEBRIEF);
    assert.notEqual(result, null);
    assert.equal(result?.greeting, VALID_DEBRIEF.greeting);
    assert.deepEqual(result?.paragraphs, VALID_DEBRIEF.paragraphs);
  });

  test("every field COACH_DEBRIEF_JSON_SCHEMA.required lists is enforced by the validator", () => {
    for (const key of COACH_DEBRIEF_JSON_SCHEMA.required) {
      const broken = { ...VALID_DEBRIEF, [key]: undefined };
      delete (broken as Record<string, unknown>)[key];
      assert.equal(
        validateCoachDebriefShape(broken),
        null,
        `removing required field "${key}" must fail validation`,
      );
    }
  });

  test("rejects a refusal / empty object", () => {
    assert.equal(validateCoachDebriefShape({}), null);
  });

  test("rejects null, undefined, and non-object output", () => {
    assert.equal(validateCoachDebriefShape(null), null);
    assert.equal(validateCoachDebriefShape(undefined), null);
    assert.equal(validateCoachDebriefShape("a refusal string"), null);
    assert.equal(validateCoachDebriefShape(42), null);
  });

  test("rejects a blank greeting", () => {
    assert.equal(validateCoachDebriefShape({ ...VALID_DEBRIEF, greeting: "   " }), null);
  });

  test("rejects wrong types for array fields", () => {
    assert.equal(validateCoachDebriefShape({ ...VALID_DEBRIEF, paragraphs: "not an array" }), null);
    assert.equal(validateCoachDebriefShape({ ...VALID_DEBRIEF, highlights: [1, 2, 3] }), null);
  });

  test("rejects wrong types for nullable string fields", () => {
    assert.equal(validateCoachDebriefShape({ ...VALID_DEBRIEF, nextFocus: 5 }), null);
  });

  test("accepts null for every nullable field", () => {
    const allNull = {
      ...VALID_DEBRIEF,
      nextFocus: null,
      recovery: null,
      nutrition: null,
      hydration: null,
    };
    assert.notEqual(validateCoachDebriefShape(allNull), null);
  });

  test("trims and caps paragraphs/highlights the same way the schema's array shape implies", () => {
    const long = {
      ...VALID_DEBRIEF,
      paragraphs: ["a", "b", "c", "d", "e", "f", "g"],
      highlights: ["1", "2", "3", "4", "5"],
    };
    const result = validateCoachDebriefShape(long);
    assert.ok(result);
    assert.equal(result!.paragraphs.length, 5);
    assert.equal(result!.highlights.length, 3);
  });

  // VIORA-COACH-DEBRIEF-SAFE-RECOVERY-003 — COACH_DEBRIEF_JSON_SCHEMA
  // declares additionalProperties: false; the runtime validator must
  // reject any response carrying a key outside the seven approved ones,
  // not just validate the ones it recognizes.
  describe("rejects additional properties (schema declares additionalProperties: false)", () => {
    test("a valid response containing exactly the seven approved properties is accepted", () => {
      assert.deepEqual(
        Object.keys(VALID_DEBRIEF).sort(),
        [...COACH_DEBRIEF_JSON_SCHEMA.required].sort(),
      );
      assert.notEqual(validateCoachDebriefShape(VALID_DEBRIEF), null);
    });

    test("one unknown top-level property is rejected, even alongside all seven valid fields", () => {
      const withExtra = { ...VALID_DEBRIEF, note: "a harmless-looking extra field" };
      assert.equal(validateCoachDebriefShape(withExtra), null);
    });

    test("a provider/raw-error-like unknown property is rejected", () => {
      const withProviderLeak = {
        ...VALID_DEBRIEF,
        error: "OpenAI API error: invalid_api_key (sk-live-abc123...)",
      };
      assert.equal(validateCoachDebriefShape(withProviderLeak), null);
      const withRawField = {
        ...VALID_DEBRIEF,
        raw: { status: 500, message: "internal provider failure" },
      };
      assert.equal(validateCoachDebriefShape(withRawField), null);
    });
  });
});

describe("parseCoachDebriefResponseText — the complete output only, never a search", () => {
  const validJson = JSON.stringify(VALID_DEBRIEF);

  test("valid JSON only (optionally padded with whitespace) is accepted", () => {
    assert.deepEqual(parseCoachDebriefResponseText(validJson), VALID_DEBRIEF);
    assert.deepEqual(parseCoachDebriefResponseText(`\n  ${validJson}\n`), VALID_DEBRIEF);
  });

  test("text before valid JSON is rejected", () => {
    assert.throws(() => parseCoachDebriefResponseText(`Here you go:\n${validJson}`));
  });

  test("text after valid JSON is rejected", () => {
    assert.throws(() => parseCoachDebriefResponseText(`${validJson}\nHope that helps!`));
  });

  test("Markdown-fenced JSON is rejected", () => {
    assert.throws(() => parseCoachDebriefResponseText("```json\n" + validJson + "\n```"));
    assert.throws(() => parseCoachDebriefResponseText("```\n" + validJson + "\n```"));
  });

  test("two concatenated JSON objects are rejected", () => {
    assert.throws(() => parseCoachDebriefResponseText(`${validJson}${validJson}`));
    assert.throws(() => parseCoachDebriefResponseText(`${validJson} ${validJson}`));
  });

  test("malformed JSON is rejected", () => {
    assert.throws(() => parseCoachDebriefResponseText("{not valid json"));
    assert.throws(() => parseCoachDebriefResponseText(""));
  });
});
