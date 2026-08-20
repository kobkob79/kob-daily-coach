import { createServer, loadEnv } from "vite";

const localEnv = loadEnv("development", process.cwd(), "");

if (localEnv.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = localEnv.OPENAI_API_KEY;
}

process.env.VIORA_AI_PROVIDER = "openai";
process.env.VIORA_AI_SMOKE_DIAGNOSTICS = "1";

const server = await createServer({
  appType: "custom",
  configFile: false,
  server: { middlewareMode: true },
});

try {
  const [{ generateAdvisorResponse }, { VIORA_ADVISOR_MODEL }] = await Promise.all([
    server.ssrLoadModule("/src/lib/advisor-core/server/generate-advisor-response.server.ts"),
    server.ssrLoadModule("/src/lib/advisor-core/server/config.server.ts"),
  ]);

  const response = await generateAdvisorResponse({
    advisor_id: "daniel",
    conversation_id: "local-smoke-daniel",
    message: "איזה אימון כוח קצר אפשר לעשות היום ב-30 דקות?",
  });

  console.log(
    JSON.stringify({
      model: VIORA_ADVISOR_MODEL,
      response_id: response.response_id,
      success: true,
      text: response.text,
    }),
  );
} catch (error) {
  const internalErrorCategory =
    error && typeof error === "object" && "code" in error
      ? error.code
      : "SMOKE_RUNTIME_FAILURE";

  console.log(
    JSON.stringify({
      internal_error_category: internalErrorCategory,
      success: false,
    }),
  );
  process.exitCode = 1;
} finally {
  await server.close();
}
