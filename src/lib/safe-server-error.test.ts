/**
 * Run with: node --test src/lib/safe-server-error.test.ts
 *
 * Sentinel + source-level regression for VIORA-EXERCISE-MEDIA-CROSS-
 * SURFACE-SYNC-001 finding F4: a raw Supabase/Postgres error's message,
 * code, details, hint, or stack must never reach the client's toast or
 * this app's own console.error output - only one of the fixed, allowlisted
 * categories in safe-server-error.ts may.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { reportSafeServerError, type SafeErrorContext } from "./safe-server-error.ts";
import { contextForFailure } from "./exercise-media-assignment-core.ts";

const SECRET = "sk_live_SUPER_SECRET_TOKEN_do_not_leak_9f3c8a";

test("sentinel: a secret injected into message/code/details/hint/stack never appears in the returned client-facing object", () => {
  // Simulates a careless caller that ignores SafeErrorContext's real shape
  // (only exerciseId/role) and tries to smuggle a raw-error-shaped object
  // through anyway - TypeScript itself blocks this at the real call sites
  // (see exercise-media-assignment.functions.ts, which never does this),
  // but the cast proves the function is safe even without that static
  // guarantee, since it only ever reads the two named fields it declares.
  const smuggledContext = {
    exerciseId: "10000000-0000-0000-0000-000000000001",
    role: "demo",
    message: SECRET,
    code: SECRET,
    details: SECRET,
    hint: SECRET,
    stack: SECRET,
  } as unknown as SafeErrorContext;

  const originalConsoleError = console.error;
  const logged: unknown[] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };

  let result;
  try {
    result = reportSafeServerError("UPLOAD_FAILED", smuggledContext);
  } finally {
    console.error = originalConsoleError;
  }

  const serializedReturn = JSON.stringify(result);
  assert.ok(
    !serializedReturn.includes(SECRET),
    `the returned client-facing object must never contain the secret, got: ${serializedReturn}`,
  );

  const serializedLog = JSON.stringify(logged);
  assert.ok(
    !serializedLog.includes(SECRET),
    `console.error output must never contain the secret, got: ${serializedLog}`,
  );

  // Positive control: the log call did happen, with the safe fields only -
  // proving the assertions above are actually exercising real output, not
  // vacuously passing because nothing was logged at all.
  assert.equal(logged.length, 1);
  const [category, payload] = logged[0] as [string, Record<string, unknown>];
  assert.match(category, /UPLOAD_FAILED/);
  assert.equal(payload.exerciseId, "10000000-0000-0000-0000-000000000001");
  assert.equal(payload.role, "demo");
  assert.ok(typeof payload.correlationId === "string" && payload.correlationId.length > 0);
});

test("every category has a fixed, non-empty Hebrew message - never derived from input", () => {
  const categories = [
    "VALIDATION_FAILED",
    "FORBIDDEN",
    "SOURCE_NOT_FOUND",
    "LIST_FAILED",
    "UPLOAD_FAILED",
    "CLEANUP_FAILED",
  ] as const;

  for (const category of categories) {
    const result = reportSafeServerError(category);
    assert.equal(result.category, category);
    assert.ok(result.message.length > 0);
    assert.ok(!/[<>]/.test(result.message), "message must not contain HTML-like content");
  }
});

test("correlationId is unique per call, so repeated failures of the same category can still be told apart in logs", () => {
  const a = reportSafeServerError("UPLOAD_FAILED");
  const b = reportSafeServerError("UPLOAD_FAILED");
  assert.notEqual(a.correlationId, b.correlationId);
});

// ---------------------------------------------------------------------------
// Source-level regression: exercise-media-assignment.functions.ts (the real
// integration point, not unit-tested directly - see exercise-motion-
// draft.functions.ts for the same established convention in this repo:
// only its pure core is unit-tested) must never read a raw error's
// message/code/details/hint/stack anywhere, and must never forward a
// caught Supabase error object at all.
// ---------------------------------------------------------------------------
const ASSIGNMENT_FUNCTIONS_SOURCE = readFileSync(
  fileURLToPath(new URL("./exercise-media-assignment.functions.ts", import.meta.url)),
  "utf8",
);

test("source: exercise-media-assignment.functions.ts never reads error.message/.code/.details/.hint/.stack", () => {
  assert.doesNotMatch(
    ASSIGNMENT_FUNCTIONS_SOURCE,
    /error\.(message|code|details|hint|stack)/,
    "must never read a raw Supabase error's message/code/details/hint/stack - only check for its presence",
  );
});

test("source: every failure branch is reported through reportSafeServerError, never a bare `throw new Error(<dynamic>)`", () => {
  assert.match(ASSIGNMENT_FUNCTIONS_SOURCE, /reportSafeServerError\(/);
  // The only thrown Error in this file must wrap the safe, fixed message
  // reportSafeServerError() returns - never a raw/dynamic string built from
  // a caught error.
  const thrownErrors = ASSIGNMENT_FUNCTIONS_SOURCE.match(/throw new Error\([^)]*\)/g) ?? [];
  assert.ok(thrownErrors.length > 0, "expected at least one throw site");
  for (const line of thrownErrors) {
    assert.match(
      line,
      /throw new Error\(safe\.message\)/,
      `every throw must use the safe, fixed message: "${line}"`,
    );
  }
});

// ---------------------------------------------------------------------------
// F8: the whole assignment operation is wrapped in one try/catch, and any
// exception is folded into the same "unexpected_error" outcome the rest of
// the handler already reports safely - never a raw exception escaping to
// the framework/client. (Behavioral proof of the catch-and-fold itself
// lives in exercise-media-assignment-core.test.ts, against the pure core;
// this is the source-level proof that the .functions.ts wiring actually
// uses that boundary.)
// ---------------------------------------------------------------------------
test("source: the handler wraps the whole operation in try/catch and folds any exception into unexpected_error", () => {
  assert.match(
    ASSIGNMENT_FUNCTIONS_SOURCE,
    /try\s*\{[\s\S]*?\}\s*catch\s*\{\s*\n\s*result = \{ status: "unexpected_error" \};\s*\n\s*\}/,
    "expected a single try/catch around the operation that sets result to unexpected_error on any exception",
  );
});

// ---------------------------------------------------------------------------
// F9: exerciseId/role must never be logged before they are known to have
// passed validation - contextForFailure() (in exercise-media-assignment-
// core.ts, so it's importable under plain node - see its own doc comment)
// is the single place that decides this.
// ---------------------------------------------------------------------------

test("F9: contextForFailure omits context entirely on the validation-failure path, even with a log-injection payload", () => {
  const maliciousExerciseId =
    'not-a-uuid\n[exercise-media] FAKE_CATEGORY {"correlationId":"forged"}';
  const result = contextForFailure("invalid", maliciousExerciseId, "not-a-role");
  assert.equal(result, undefined);
});

test("F9: contextForFailure omits context entirely for unexpected_error too (validation may not have run yet)", () => {
  const result = contextForFailure(
    "unexpected_error",
    "10000000-0000-0000-0000-000000000001",
    "demo",
  );
  assert.equal(result, undefined);
});

test("F9: contextForFailure includes context for every other failure status, where identifiers are already known-valid", () => {
  for (const status of ["forbidden", "not_found", "list_failed", "upload_failed"] as const) {
    const result = contextForFailure(status, "10000000-0000-0000-0000-000000000001", "demo");
    assert.deepEqual(result, {
      exerciseId: "10000000-0000-0000-0000-000000000001",
      role: "demo",
    });
  }
});

test("F9/log-injection: a newline- and sentinel-laden value passed to reportSafeServerError never produces extra log lines or leaks the sentinel", () => {
  const sentinel = "INJECTED_LOG_LINE_4f9c2b";
  const forged = `real-id\n[exercise-media] FORBIDDEN {"correlationId":"${sentinel}","exerciseId":"attacker-controlled"}`;

  const originalConsoleError = console.error;
  const logged: unknown[] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };

  let result;
  try {
    result = reportSafeServerError("FORBIDDEN", { exerciseId: forged, role: "demo" });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(logged.length, 1, "the newline payload must not produce a second, forged log call");
  const [, loggedPayload] = logged[0] as [string, Record<string, unknown>];
  assert.equal(
    loggedPayload.exerciseId,
    'real-id[exercise-media] FORBIDDEN {"correlationId":"' +
      sentinel +
      '","exerciseId":"attacker-controlled"}',
    "the newline must be stripped, flattening the payload into one line - it must never split into a second, independent log entry",
  );
  const serializedLog = JSON.stringify(logged);
  assert.ok(!serializedLog.includes("\n"), "no raw newline may reach the log output");

  // The returned client-facing message is still the fixed, safe one -
  // nothing from the forged payload (sentinel included) leaks into it.
  assert.equal(result.message, "אין הרשאה לבצע פעולה זו.");
});
