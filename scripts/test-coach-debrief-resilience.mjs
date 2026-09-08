/**
 * Coach Debrief safe-error-handling resilience suite
 * (VIORA-COACH-DEBRIEF-SAFE-RECOVERY-002).
 *
 * Exercises every real OpenAI Responses API failure path — auth, quota,
 * rate limit, model access, bad request, timeout, connection failure,
 * refusal/incomplete/empty/malformed/schema-invalid output — by injecting
 * a synthetic `fetch` into a freshly constructed OpenAI client, exactly as
 * scripts/test-daily-brief-resilience.mjs does for the daily brief. No
 * request ever leaves the process; nothing here calls the real OpenAI API.
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  configFile: false,
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  server: { middlewareMode: true },
});

const ctx = {
  now: "2026-09-08T12:00:00.000Z",
  displayName: "QA",
  workoutName: "יום רגליים",
  durationMinutes: 45,
  totalVolumeKg: 4200,
  prevVolumeKg: 4000,
  workoutsLast7Days: 3,
  workoutsLast30Days: 12,
  avgVolumeLast4WorkoutsKg: 4100,
  volumeTrendPct: 5,
  completionRatePct: 100,
  plannedSets: 12,
  completedSets: 12,
  skippedSets: 0,
  difficulty: 7,
  energy: 6,
  pain: null,
  notes: null,
  daysSinceLastWorkout: 2,
  exercises: [],
  nextWorkoutName: null,
};

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function completedResponse(text) {
  return jsonResponse(200, {
    id: "resp_test",
    object: "response",
    status: "completed",
    output: [
      {
        type: "message",
        id: "msg_test",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
  });
}

const VALID_DEBRIEF_JSON = {
  greeting: "אימון חזק היום.",
  paragraphs: ["עבדת יפה על הרגליים."],
  highlights: ["שיא אישי בסקוואט"],
  nextFocus: null,
  recovery: null,
  nutrition: null,
  hydration: null,
};

try {
  const { generateCoachDebriefResult } = await server.ssrLoadModule("/src/lib/coach-debrief.server.ts");
  const results = {};

  // 1. Missing key — never calls the network.
  {
    let called = false;
    const r = await generateCoachDebriefResult(ctx, {
      fetchImpl: async () => {
        called = true;
        throw new Error("must not call gateway");
      },
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "NOT_CONFIGURED");
    assert.equal(called, false);
    results.not_configured_no_network_call = "PASS";
  }

  // 2. Auth failure (401) — never leaks the raw provider message.
  {
    const secret = "sk-LEAKED-SECRET-TOKEN-DO-NOT-SHOW";
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () =>
        jsonResponse(401, {
          error: { message: `Incorrect API key provided: ${secret}`, type: "invalid_request_error", code: "invalid_api_key" },
        }),
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "AUTH_FAILED");
    const serialized = JSON.stringify(r);
    assert.ok(!serialized.includes(secret), "raw provider error text must never reach the result");
    assert.ok(!serialized.toLowerCase().includes("api key"), "result must not mention API keys at all");
    results.auth_failed_no_leak = "PASS";
  }

  // 3. Insufficient quota (429 + insufficient_quota code) → BILLING_OR_QUOTA.
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () =>
        jsonResponse(429, {
          error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" },
        }),
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "BILLING_OR_QUOTA");
    results.billing_or_quota = "PASS";
  }

  // 4. Ordinary rate limit (429, no insufficient_quota code) → RATE_LIMITED.
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () =>
        jsonResponse(429, {
          error: { message: "Rate limit reached", type: "requests", code: "rate_limit_exceeded" },
        }),
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "RATE_LIMITED");
    results.rate_limited = "PASS";
  }

  // 5. Model access failure (403 / model_not_found) → MODEL_ACCESS.
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () =>
        jsonResponse(403, {
          error: { message: "You do not have access to this model", type: "invalid_request_error", code: "model_not_found" },
        }),
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "MODEL_ACCESS");
    results.model_access = "PASS";
  }

  // 6. Bad request (400) → INVALID_REQUEST.
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () =>
        jsonResponse(400, {
          error: { message: "Invalid schema", type: "invalid_request_error", code: "invalid_request" },
        }),
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "INVALID_REQUEST");
    results.invalid_request = "PASS";
  }

  // 7. Provider 5xx → PROVIDER_UNAVAILABLE.
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () => jsonResponse(500, { error: { message: "Internal server error" } }),
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "PROVIDER_UNAVAILABLE");
    results.provider_5xx_unavailable = "PASS";
  }

  // 8. Network/connection failure (fetch itself rejects) → PROVIDER_UNAVAILABLE.
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "PROVIDER_UNAVAILABLE");
    results.connection_failure_unavailable = "PASS";
  }

  // 9. Timeout — fetch hangs past the configured timeout, respecting abort.
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      timeoutMs: 80,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted.");
            err.name = "AbortError";
            reject(err);
          });
        }),
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "TIMEOUT");
    results.timeout = "PASS";
  }

  // 10a. Incomplete/refused response → INVALID_RESPONSE.
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () =>
        jsonResponse(200, { id: "resp_test", object: "response", status: "incomplete", output: [] }),
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "INVALID_RESPONSE");
    results.incomplete_response = "PASS";
  }

  // 10b. Empty output → INVALID_RESPONSE.
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () =>
        jsonResponse(200, { id: "resp_test", object: "response", status: "completed", output: [] }),
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "INVALID_RESPONSE");
    results.empty_output = "PASS";
  }

  // 10c. Non-JSON / malformed text → INVALID_RESPONSE.
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () => completedResponse("מצטער, אינני יכול לעזור עם זה."),
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "INVALID_RESPONSE");
    results.malformed_text = "PASS";
  }

  // 10d. Schema-invalid JSON (missing required fields) → INVALID_RESPONSE.
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () => completedResponse(JSON.stringify({ greeting: "שלום" })),
    });
    assert.equal(r.status, "error");
    assert.equal(r.category, "INVALID_RESPONSE");
    results.schema_invalid_json = "PASS";
  }

  // 11. Valid debrief → status "ok", full shape preserved.
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () => completedResponse(JSON.stringify(VALID_DEBRIEF_JSON)),
    });
    assert.equal(r.status, "ok");
    assert.equal(r.debrief.greeting, VALID_DEBRIEF_JSON.greeting);
    assert.deepEqual(r.debrief.highlights, VALID_DEBRIEF_JSON.highlights);
    results.valid_debrief_ok = "PASS";
  }

  // 12. Every error result carries a correlation id and never the word "openai".
  {
    const r = await generateCoachDebriefResult(ctx, {
      apiKey: "synthetic-test-key",
      fetchImpl: async () => jsonResponse(401, { error: { message: "boom", code: "invalid_api_key" } }),
    });
    assert.match(r.correlationId, /^dbg_[a-z0-9]{8,20}$/i);
    assert.ok(!JSON.stringify(r).toLowerCase().includes("openai"));
    results.correlation_id_present_and_safe = "PASS";
  }

  console.log(JSON.stringify(results, null, 2));
} finally {
  await server.close();
}
