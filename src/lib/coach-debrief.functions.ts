/**
 * Coach Debrief — the post-workout conversation between Viora and the athlete.
 *
 * Receives a compact snapshot of the finished session (planned vs done,
 * volume, rest behaviour, failed sets, PRs, duration, feedback) and asks the
 * AI gateway for a short, natural Hebrew debrief. The AI decides which topics
 * matter; nothing is templated on our side.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createOpenAIClient } from "@/lib/advisor-core/server/openai-client.server";
import { classifyOpenAIAPIError, extractResponseText } from "@/lib/advisor-core/server/providers/openai-provider.server";
import { AdvisorCoreError } from "@/lib/advisor-core/response";
import { VIORA_ADVISOR_MODEL } from "@/lib/advisor-core/server/config.server";
import OpenAI from "openai";

export interface DebriefExercise {
  name: string;
  plannedSets: number;
  completedSets: number;
  topWeightKg: number | null;
  topReps: number | null;
  volumeKg: number;
  isPR: boolean;
  prevBestKg: number | null;
  avgRestSeconds: number | null;
  plannedRestSeconds: number | null;
  repsDropped: boolean;
  /** Estimated 1RM this session vs. the best before it (Epley). */
  e1rmKg: number | null;
  prevE1rmKg: number | null;
  weightDeltaKg: number | null;
}

export interface CoachDebriefContext {
  now: string;
  displayName: string;
  workoutName: string | null;
  durationMinutes: number;
  totalVolumeKg: number;
  prevVolumeKg: number | null;
  /** Consistency + progression signals used for concrete, non-generic feedback. */
  workoutsLast7Days: number;
  workoutsLast30Days: number;
  avgVolumeLast4WorkoutsKg: number | null;
  volumeTrendPct: number | null;
  completionRatePct: number;
  plannedSets: number;
  completedSets: number;
  skippedSets: number;
  difficulty: number | null;
  energy: number | null;
  pain: string | null;
  notes: string | null;
  daysSinceLastWorkout: number | null;
  exercises: DebriefExercise[];
  nextWorkoutName: string | null;
}

export interface CoachDebrief {
  greeting: string;
  paragraphs: string[];
  highlights: string[];
  nextFocus: string | null;
  recovery: string | null;
  nutrition: string | null;
  hydration: string | null;
  unavailable?: boolean;
}

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

export class DebriefNotConnectedError extends Error {
  code = "DEBRIEF_NOT_CONNECTED" as const;
}

function str(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

export const generateCoachDebrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ({ ctx: (input ?? {}) as CoachDebriefContext }))
  .handler(async ({ data }): Promise<CoachDebrief> => {
    let client: OpenAI;
    try {
      client = createOpenAIClient();
    } catch (e) {
      throw new DebriefNotConnectedError("OPENAI_API_KEY חסר בשרת.");
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
            )} — פתח אחרת ממה שהיית פותח בדרך כלל.\n\n${JSON.stringify(data.ctx)}`,
          },
        ],
        text: { format: { type: "json_schema", name: "debrief_schema", schema: { type: "object" } } },
      });
    } catch (e) {
      if (e instanceof OpenAI.APIError) {
        const category = classifyOpenAIAPIError(e);
        if (category === "OPENAI_INSUFFICIENT_QUOTA" || category === "OPENAI_RATE_LIMIT") {
          return {
            greeting:
              category === "OPENAI_INSUFFICIENT_QUOTA"
                ? "אזלו זיכויי ה-AI — הדיברוף האישי יחזור ברגע שהזיכויים יתחדשו."
                : "יותר מדי בקשות ל-AI כרגע — ננסה שוב בקרוב.",
            paragraphs: [],
            highlights: [],
            nextFocus: null,
            recovery: null,
            nutrition: null,
            hydration: null,
            unavailable: true,
          };
        }
        throw new DebriefNotConnectedError(`שגיאת ספק (${e.status}): ${e.message.slice(0, 180)}`);
      }
      if (e instanceof AdvisorCoreError) {
        throw new DebriefNotConnectedError(`שגיאת ספק: ${e.message}`);
      }
      throw new DebriefNotConnectedError(`לא ניתן להגיע ל-AI: ${(e as Error).message}`);
    }

    const extraction = extractResponseText(response);
    const raw: string = extraction.text;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new DebriefNotConnectedError("תשובת AI לא תקינה.");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new DebriefNotConnectedError("JSON פגום מה-AI.");
    }

    const paragraphs = Array.isArray(parsed.paragraphs)
      ? parsed.paragraphs.map((p) => String(p).trim()).filter(Boolean).slice(0, 5)
      : [];
    const highlights = Array.isArray(parsed.highlights)
      ? parsed.highlights.map((p) => String(p).trim()).filter(Boolean).slice(0, 3)
      : [];

    return {
      greeting: str(parsed.greeting) ?? "סיימת. בוא נעבור על מה שקרה.",
      paragraphs,
      highlights,
      nextFocus: str(parsed.nextFocus),
      recovery: str(parsed.recovery),
      nutrition: str(parsed.nutrition),
      hydration: str(parsed.hydration),
    };
  });
