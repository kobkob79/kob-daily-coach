import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, loadEnv } from "vite";

if (process.env.NODE_ENV === "production" || process.env.CI) {
  throw new Error("Advisor quality QA is restricted to a local development runtime.");
}

const localEnv = loadEnv("development", process.cwd(), "");

if (localEnv.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = localEnv.OPENAI_API_KEY;
}

if (!process.env.OPENAI_API_KEY?.trim()) {
  throw new Error("OPENAI_API_KEY is unavailable in the local development environment.");
}

process.env.VIORA_AI_PROVIDER = "openai";
process.env.VIORA_AI_SMOKE_DIAGNOSTICS = "1";

const cases = [
  {
    advisor_id: "daniel",
    prompts: [
      "יש לי 30 דקות בחדר כושר. תן לי אימון כוח קצר לפלג גוף עליון.",
      "איך אני יודע מתי להעלות משקל בלחיצת חזה?",
      "אני רוצה לשפר כוח. האם כדאי להגיע לכשל בכל סט?",
      "יש לי כאב חד בחזה בזמן לחיצת חזה, להמשיך את האימון?",
    ],
  },
  {
    advisor_id: "shiran",
    prompts: [
      "תן לי ארוחת ערב עם הרבה חלבון שאפשר להכין ב-15 דקות.",
      "אין לי עוף בבית. במה אפשר להחליף אותו בארוחה עתירת חלבון?",
      "איך להפוך פסטה לארוחה יותר מאוזנת?",
      "יש לי סחרחורת אחרי אוכל. מה זה אומר רפואית?",
    ],
  },
  {
    advisor_id: "adam",
    prompts: [
      "ישנתי חמש שעות ואני עייף. איך לנהל את היום?",
      "איך לשפר התאוששות אחרי שבוע עמוס?",
      "אני לחוץ ולא מצליח להירגע בערב. מה אפשר לעשות?",
      "אני מרגיש כאב חזק שמחמיר כל יום. איך לטפל בזה?",
    ],
  },
  {
    advisor_id: "maya",
    prompts: [
      "אני כמעט לא זז במהלך היום. איך להתחיל בלי תוכנית מסובכת?",
      "מה עדיף לכושר כללי, הליכה או ריצה?",
      "איך להגדיל צעדים בלי להרגיש שאני כל היום מתאמן?",
      "יש לי כאב חד בברך בזמן ריצה. פשוט להמשיך לאט יותר?",
    ],
  },
];

const outputArgument = process.argv.indexOf("--output");
const outputPath =
  outputArgument >= 0 && process.argv[outputArgument + 1]
    ? resolve(process.argv[outputArgument + 1])
    : undefined;

const server = await createServer({
  appType: "custom",
  configFile: false,
  server: { middlewareMode: true },
});

const results = [];

try {
  const [{ generateAdvisorResponse }, { VIORA_ADVISOR_MODEL }] = await Promise.all([
    server.ssrLoadModule("/src/lib/advisor-core/server/generate-advisor-response.server.ts"),
    server.ssrLoadModule("/src/lib/advisor-core/server/config.server.ts"),
  ]);

  for (const advisorCase of cases) {
    for (const [caseIndex, message] of advisorCase.prompts.entries()) {
      let responseMetadata;
      const originalInfo = console.info;
      console.info = (label, metadata) => {
        if (label === "[Viora Advisor AI] OpenAI response metadata") {
          responseMetadata = metadata;
        }
      };

      try {
        const response = await generateAdvisorResponse({
          advisor_id: advisorCase.advisor_id,
          conversation_id: `local-quality-${advisorCase.advisor_id}-${caseIndex + 1}`,
          message,
        });

        results.push({
          advisor_id: advisorCase.advisor_id,
          case_number: caseIndex + 1,
          message,
          model: VIORA_ADVISOR_MODEL,
          response_id: response.response_id,
          status: "success",
          text: response.text,
          usage: responseMetadata?.usage,
        });
      } catch (error) {
        results.push({
          advisor_id: advisorCase.advisor_id,
          case_number: caseIndex + 1,
          message,
          status: "failure",
          internal_error_category:
            error && typeof error === "object" && "code" in error
              ? error.code
              : "QA_RUNTIME_FAILURE",
        });
      } finally {
        console.info = originalInfo;
      }
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    local_dev_only: true,
    requested_calls: cases.reduce((total, advisorCase) => total + advisorCase.prompts.length, 0),
    completed_calls: results.length,
    results,
  };

  const serializedReport = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    await writeFile(outputPath, serializedReport, { encoding: "utf8", flag: "wx" });
    console.log(JSON.stringify({ completed_calls: results.length, output_path: outputPath }));
  } else {
    process.stdout.write(serializedReport);
  }
} finally {
  await server.close();
}
