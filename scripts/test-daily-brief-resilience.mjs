import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  configFile: false,
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  server: { middlewareMode: true },
});

const context = {
  now: "2026-08-21T12:00:00.000Z",
  displayName: "QA",
  shift: null,
  proteinToday: 0,
  proteinTarget: 150,
  caloriesEaten: 0,
  caloriesBurned: 2000,
  calorieTarget: null,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
  waterMlToday: 0,
  waterTargetMl: 2500,
  workoutTodayMinutes: 0,
  workoutYesterdayMinutes: 0,
  lastSleepHours: null,
  avgSleepHours: null,
  currentWeightKg: null,
  weightDelta30dKg: null,
  pain: null,
  supplementsToday: [],
  supplementsHabitual: [],
  meals: [],
  goal: null,
  recoveryPct: 50,
  hydrationPct: 0,
  energyPct: 50,
  healthScore: 40,
};

try {
  const { generateDailyBriefResult } = await server.ssrLoadModule(
    "/src/lib/daily-brief.functions.ts",
  );

  let missingKeyCalls = 0;
  const missingKey = await generateDailyBriefResult(context, {
    fetchImpl: async () => {
      missingKeyCalls += 1;
      throw new Error("must not call gateway");
    },
  });
  assert.deepEqual(missingKey, { status: "unavailable", reason: "not_configured" });
  assert.equal(missingKeyCalls, 0);

  const providerFailure = await generateDailyBriefResult(context, {
    apiKey: "synthetic-test-key",
    fetchImpl: async () => {
      throw new Error("synthetic gateway failure");
    },
  });
  assert.deepEqual(providerFailure, { status: "unavailable", reason: "provider_error" });

  const providerSuccess = await generateDailyBriefResult(context, {
    apiKey: "synthetic-test-key",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  hero: "תקציר יומי תקין",
                  statusLine: "הנתונים מעודכנים",
                  analysis: [],
                  supplementAnalysis: [],
                  wellDone: [],
                  improve: [],
                  mission: [],
                  learned: [],
                  calorieVerdict: "",
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  });
  assert.equal(providerSuccess.status, "available");
  assert.equal(providerSuccess.brief.hero, "תקציר יומי תקין");

  console.log(
    JSON.stringify({
      missing_key_fallback: "PASS",
      gateway_failure_fallback: "PASS",
      gateway_success_daily_brief: "PASS",
    }),
  );
} finally {
  await server.close();
}
