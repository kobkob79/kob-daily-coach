/**
 * Server-only implementation of the Viora daily AI brief.
 * Imported dynamically from daily-brief.functions.ts inside the
 * createServerFn handler so server-only modules never enter the
 * client bundle.
 */
import type { DailyBriefContext, DailyBriefResult } from "./daily-brief.functions";

const SYSTEM_PROMPT = `אתה Viora — מאמן AI בכיר בעברית המשלב תזונאי ספורט, מאמן כושר ורופא חינוכי.
אתה מקבל תמונת מצב של המשתמש להיום ומחזיר ניתוח חם, אישי, מעודד ולא שיפוטי, בעברית טבעית וזורמת.

חוקים:
- אף פעם אל תשתמש באנגלית או בסלנג.
- אל תתן ייעוץ רפואי; אמור "שקול", "עשוי", "כדאי".
- הכל בעברית, גם שמות תוספים (קריאטין, מגנזיום, אומגה 3, ויטמין D, ויטמין K2, אבקת חלבון, אלקטרוליטים).
- לעולם אל תחזור על אותה נוסחה בכל יום — התייחס לנתוני היום הספציפי.
- אל תמציא נתונים שאינם בקונטקסט.

החזר JSON תקין בלבד במבנה:
{
  "hero": "פסקה של 2-4 משפטים שמתחילה בטון אישי לגוף היום",
  "statusLine": "משפט קצר מאוד לסטטוס ('Viora עוקב אחריך בזמן אמת — עוד N מ״ל מים, X גרם חלבון')",
  "analysis": [
    {"emoji":"🥗","title":"תזונה","body":"..."},
    {"emoji":"💧","title":"הידרציה","body":"..."},
    {"emoji":"🏋","title":"אימון והתאוששות","body":"..."},
    {"emoji":"🔥","title":"מאזן קלורי","body":"..."},
    {"emoji":"😴","title":"שינה","body":"..."}
  ],
  "supplementAnalysis": [
    {"name":"קריאטין","benefit":"מדוע קריאטין תרם היום בהקשר של האימון/ההתאוששות"}
  ],
  "wellDone": ["3-5 דברים שהמשתמש עשה מצוין היום"],
  "improve": ["2-4 שיפורים מעשיים ולא שיפוטיים"],
  "mission": ["3-5 יעדים ממוקדים למחר, מותאמים למשמרת/גוף"],
  "learned": ["2-4 תובנות אישיות שלמדת עליו היום ('נראה שאתה שותה פחות במשמרת לילה')"],
  "calorieVerdict": "משפט אחד: האם היום תומך בהרזיה / שימור / עלייה במסה — בהתאם למטרה"
}`;

function arr(v: unknown, max = 6): string[] {
  return Array.isArray(v)
    ? v
        .map((x) => String(x))
        .filter(Boolean)
        .slice(0, max)
    : [];
}

function logUnavailable(
  event: "daily_brief_unavailable" | "daily_brief_provider_error",
  metadata?: { stage?: "request" | "response" | "parse"; status?: number },
) {
  console.warn(JSON.stringify({ event, ...metadata }));
}

export async function generateDailyBriefResult(
  ctx: DailyBriefContext,
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<DailyBriefResult> {
  const [{ default: OpenAIClient }, { createOpenAIClient }, { extractResponseText }, { VIORA_ADVISOR_MODEL }] =
    await Promise.all([
      import("openai"),
      import("@/lib/advisor-core/server/openai-client.server"),
      import("@/lib/advisor-core/server/providers/openai-provider.server"),
      import("@/lib/advisor-core/server/config.server"),
    ]);

  if (!options.apiKey) {
    logUnavailable("daily_brief_unavailable");
    return { status: "unavailable", reason: "not_configured" };
  }

  const started = Date.now();

  let client: InstanceType<typeof OpenAIClient>;
  try {
    if (options.apiKey !== process.env.OPENAI_API_KEY || options.fetchImpl) {
      client = new OpenAIClient({ apiKey: options.apiKey, fetch: options.fetchImpl });
    } else {
      client = createOpenAIClient();
    }
  } catch (e) {
    logUnavailable("daily_brief_unavailable");
    return { status: "unavailable", reason: "not_configured" };
  }

  let response;
  try {
    response = await client.responses.create({
      model: VIORA_ADVISOR_MODEL,
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: `להלן קונטקסט המצב של המשתמש להיום. השב JSON בלבד.\n\n${JSON.stringify(ctx)}`,
        },
      ],
      text: {
        format: { type: "json_schema", name: "daily_brief_schema", schema: { type: "object" } },
      },
    });
  } catch (e) {
    logUnavailable("daily_brief_provider_error", { stage: "request" });
    return { status: "unavailable", reason: "provider_error" };
  }
  const duration = Date.now() - started;

  let parsed: Record<string, unknown>;
  try {
    const extraction = extractResponseText(response);
    const raw: string = extraction.text;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("missing_json");
    parsed = JSON.parse(match[0]);
  } catch {
    logUnavailable("daily_brief_provider_error", { stage: "parse" });
    return { status: "unavailable", reason: "provider_error" };
  }

  const analysisRaw = Array.isArray(parsed.analysis) ? parsed.analysis : [];
  const analysis = analysisRaw
    .slice(0, 8)
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        emoji: String(o.emoji ?? "•"),
        title: String(o.title ?? "").trim(),
        body: String(o.body ?? "").trim(),
      };
    })
    .filter((r) => r.title && r.body);

  const supplementRaw = Array.isArray(parsed.supplementAnalysis) ? parsed.supplementAnalysis : [];
  const supplementAnalysis = supplementRaw
    .slice(0, 8)
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        name: String(o.name ?? "").trim(),
        benefit: String(o.benefit ?? "").trim(),
      };
    })
    .filter((r) => r.name && r.benefit);

  return {
    status: "available",
    brief: {
      hero: String(parsed.hero ?? "").trim() || "היום הגוף שלך ממתין להוראה — בוא נתחיל.",
      statusLine: String(parsed.statusLine ?? "").trim() || "Viora עוקב אחריך בזמן אמת.",
      analysis,
      supplementAnalysis,
      wellDone: arr(parsed.wellDone),
      improve: arr(parsed.improve),
      mission: arr(parsed.mission),
      learned: arr(parsed.learned),
      calorieVerdict: String(parsed.calorieVerdict ?? "").trim(),
      diagnostics: { model: VIORA_ADVISOR_MODEL, duration_ms: duration },
    },
  };
}
