import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { failureCategory, unavailable } from "./advisor-conversation-safe-failure.ts";

const SECRET = "sk_live_SUPER_SECRET_TOKEN_do_not_leak_9f3c8a";

describe("advisor-conversation-safe-failure", () => {
  test("returns the exact category for an allowed string", () => {
    assert.equal(failureCategory(new Error("PERSISTENCE_UNAVAILABLE")), "PERSISTENCE_UNAVAILABLE");
    assert.equal(failureCategory(new Error("OPENAI_RATE_LIMIT")), "OPENAI_RATE_LIMIT");
  });

  test("maps unknown or malicious strings to unhandled_exception", () => {
    assert.equal(failureCategory(new Error("MY_UNKNOWN_ERROR")), "unhandled_exception");
    assert.equal(failureCategory(new Error("unhandled_exception")), "unhandled_exception");
  });

  test("sentinel: a secret injected into the error message does not leak", () => {
    const error = new Error(`Connection failed: ${SECRET}`);

    // We capture console.error output to verify
    const originalConsoleError = console.error;
    const logged: unknown[] = [];
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };

    let result;
    try {
      result = unavailable("create", error);
    } finally {
      console.error = originalConsoleError;
    }

    // Verify it doesn't reach the returned result
    const serializedReturn = JSON.stringify(result);
    assert.ok(!serializedReturn.includes(SECRET), "Returned object leaked the secret");

    // Verify it doesn't reach the logged output
    const serializedLog = JSON.stringify(logged);
    assert.ok(!serializedLog.includes(SECRET), "Log leaked the secret");

    // Positive check to ensure we logged the generic category
    assert.equal(logged.length, 1);
    const [, payload] = logged[0] as [string, Record<string, unknown>];
    assert.equal(payload.failure_category, "unhandled_exception");
  });
});
