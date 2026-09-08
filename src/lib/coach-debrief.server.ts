/**
 * Server-only implementation of the Coach Debrief AI call.
 * Imported dynamically from coach-debrief.functions.ts inside the
 * createServerFn handler so server-only modules never enter the client
 * bundle — mirrors daily-brief.server.ts / daily-brief.functions.ts.
 *
 * Takes `apiKey`/`fetchImpl` as explicit parameters (rather than reading
 * `process.env`/the cached OpenAI client singleton directly) so tests can
 * exercise every real failure path — auth, quota, rate limit, timeout,
 * malformed output — via a synthetic fetch, with no live OpenAI call.
 */
import { AdvisorCoreError } from "@/lib/advisor-core/response";
import {
  buildDebriefFailure,
  COACH_DEBRIEF_JSON_SCHEMA,
  createCorrelationId,
  type CoachDebriefResult,
  type DebriefErrorCategory,
  logDebriefOutcome,
  mapAdvisorErrorCodeToDebriefCategory,
  validateCoachDebriefShape,
} from "./coach-debrief-safety";
import type { CoachDebriefContext } from "./coach-debrief.functions";

const SYSTEM_PROMPT = `אתה Viora — מאמן כוח אישי בכיר, מדבר עברית טבעית וזורמת.
זה הרגע שאחרי האימון: השחקן סיים, אתה יושב איתו לשיחה קצרה.

איך אתה מדבר:
- כמו מישהו שבאמת ראה את האימון. קונקרטי, מתייחס לתרגילים ולמספרים אמיתיים מהקונטקסט.
- קצר. 2-4 פסקאות קצרות לכל היותר, כל פסקה 1-3 משפטים.
- מקצועי, תומך, בלי חנופה ובלי הרצאות.
- לעולם לא תבנית קבועה. כל דיברוף חייב להיראות אחרת מקודמו — פתיחה אחרת, סדר אחר, דגש אחר.
- אל תמנה את כל הנושאים. בחר רק את מה שבאמת חשוב באימון הזה.
- אל תמציא נתונים שלא בקונטקסט. אין ייעוץ רפואי.
- אסור טקסט מוטיבציה כללי ("אלוף", "תמשיך כך", "אימון מעולה") בלי מספר או תרגיל שמאחוריו.
- בסס כל תצפית על נתון: שיאים, השוואה לאימון הקודם, סטים שבוצעו מול מתוכננים, התקדמות במשקל, התקדמות בנפח, עקביות (אימונים ב-7/30 ימים).

נושאים אפשריים (רק כשרלוונטי): ברכה, תצפית על האימון, הישגים, רגעים קשים, התאוששות, תזונה, שתייה, יעד לאימון הבא.

החזר JSON תקין בלבד:
{
  "greeting": "משפט פתיחה קצר ואישי (לא 'כל הכבוד' בכל פעם)",
  "paragraphs": ["פסקה", "פסקה"],
  "highlights": ["עד 3 נקודות קצרות מאוד — הישגים או תצפיות מדידות"],
  "nextFocus": "משפט אחד על היעד לאימון הבא, או null",
  "recovery": "משפט אחד על התאוששות, או null",
  "nutrition": "משפט אחד על תזונה אחרי האימון, או null",
  "hydration": "משפט אחד על שתייה, או null"
}
שדות שאינם רלוונטיים לאימון הזה — החזר null. אל תמלא הכול רק כדי למלא.`;

function hasErrorName(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === name;
}

export async function generateCoachDebriefResult(
  ctx: CoachDebriefContext,
  options: { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<CoachDebriefResult> {
  const correlationId = createCorrelationId();
  const startedAt = Date.now();

  const [{ default: OpenAIClient }, { createOpenAIClient }, config, provider] = await Promise.all([
    import("openai"),
    import("@/lib/advisor-core/server/openai-client.server"),
    import("@/lib/advisor-core/server/config.server"),
    import("@/lib/advisor-core/server/providers/openai-provider.server"),
  ]);
  const { VIORA_ADVISOR_MODEL, VIORA_ADVISOR_MAX_OUTPUT_TOKENS, VIORA_ADVISOR_REASONING_EFFORT } =
    config;
  const { classifyOpenAIAPIError, extractResponseText } = provider;

  const fail = (
    category: DebriefErrorCategory,
    fields: { httpStatus?: number; providerErrorCode?: string; providerRequestId?: string } = {},
  ) => {
    logDebriefOutcome("error", {
      correlationId,
      category,
      model: VIORA_ADVISOR_MODEL,
      durationMs: Date.now() - startedAt,
      ...fields,
    });
    return buildDebriefFailure(category, correlationId);
  };

  if (!options.apiKey) {
    return fail("NOT_CONFIGURED");
  }

  let client: InstanceType<typeof OpenAIClient>;
  try {
    client =
      options.apiKey !== process.env.OPENAI_API_KEY || options.fetchImpl
        ? new OpenAIClient({
            apiKey: options.apiKey,
            fetch: options.fetchImpl,
            maxRetries: 0,
            timeout: options.timeoutMs,
          })
        : createOpenAIClient();
  } catch (e) {
    const category =
      e instanceof AdvisorCoreError && e.code === "MISSING_OPENAI_CONFIGURATION"
        ? "NOT_CONFIGURED"
        : "PROVIDER_UNAVAILABLE";
    return fail(category);
  }

  let response;
  try {
    response = await client.responses.create({
      model: VIORA_ADVISOR_MODEL,
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: "user",
          content: `נתוני האימון שהסתיים. השב JSON בלבד. וריאציה #${Math.floor(
            Math.random() * 100000,
          )} — פתח אחרת ממה שהיית פותח בדרך כלל.\n\n${JSON.stringify(ctx)}`,
        },
      ],
      max_output_tokens: VIORA_ADVISOR_MAX_OUTPUT_TOKENS,
      reasoning: { effort: VIORA_ADVISOR_REASONING_EFFORT },
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "debrief_schema",
          schema: COACH_DEBRIEF_JSON_SCHEMA,
          strict: true,
        },
      },
    });
  } catch (e) {
    if (
      e instanceof OpenAIClient.APIConnectionTimeoutError ||
      hasErrorName(e, "APIConnectionTimeoutError")
    ) {
      return fail("TIMEOUT");
    }
    if (e instanceof OpenAIClient.APIConnectionError || hasErrorName(e, "APIConnectionError")) {
      return fail("PROVIDER_UNAVAILABLE");
    }
    if (e instanceof OpenAIClient.APIError) {
      const advisorCode = classifyOpenAIAPIError(e);
      return fail(mapAdvisorErrorCodeToDebriefCategory(advisorCode), {
        httpStatus: e.status,
        providerErrorCode: e.code ?? undefined,
        providerRequestId: e.requestID ?? undefined,
      });
    }
    if (e instanceof AdvisorCoreError) {
      return fail(mapAdvisorErrorCodeToDebriefCategory(e.code));
    }
    return fail("PROVIDER_UNAVAILABLE");
  }

  if (response.status === "incomplete") {
    return fail("INVALID_RESPONSE");
  }

  const extraction = extractResponseText(response);
  if (!extraction.text) {
    return fail("INVALID_RESPONSE");
  }

  const match = extraction.text.match(/\{[\s\S]*\}/);
  if (!match) return fail("INVALID_RESPONSE");

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return fail("INVALID_RESPONSE");
  }

  const debrief = validateCoachDebriefShape(parsed);
  if (!debrief) return fail("INVALID_RESPONSE");

  logDebriefOutcome("ok", {
    correlationId,
    model: VIORA_ADVISOR_MODEL,
    durationMs: Date.now() - startedAt,
  });
  return { status: "ok", debrief };
}
