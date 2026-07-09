/**
 * Server function that produces the Viora daily AI brief.
 *
 * Receives a compact context snapshot from the client and calls
 * google/gemini-2.5-flash via the Lovable AI Gateway to generate a
 * Hebrew, personalized daily coaching brief. No fake fallbacks — if
 * the gateway is unreachable we surface a clear connection error.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-2.5-flash";

export interface DailyBriefContext {
  now: string;
  displayName: string;
  shift: string | null;
  proteinToday: number;
  proteinTarget: number;
  caloriesEaten: number;
  caloriesBurned: number;
  calorieTarget: number | null;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  waterMlToday: number;
  waterTargetMl: number;
  workoutTodayMinutes: number;
  workoutYesterdayMinutes: number;
  lastSleepHours: number | null;
  avgSleepHours: number | null;
  currentWeightKg: number | null;
  weightDelta30dKg: number | null;
  pain: { area: string; level: number } | null;
  supplementsToday: string[];
  supplementsHabitual: string[];
  meals: Array<{ name: string; protein_g: number; calories: number }>;
  goal: "fat_loss" | "maintenance" | "muscle_gain" | null;
  recoveryPct: number;
  hydrationPct: number;
  energyPct: number;
  healthScore: number;
}

export interface DailyBrief {
  hero: string;
  statusLine: string;
  analysis: Array<{ title: string; body: string; emoji: string }>;
  supplementAnalysis: Array<{ name: string; benefit: string }>;
  wellDone: string[];
  improve: string[];
  mission: string[];
  learned: string[];
  calorieVerdict: string;
  diagnostics: { model: string; duration_ms: number };
}

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

export class BriefNotConnectedError extends Error {
  code = "BRIEF_NOT_CONNECTED" as const;
}

function arr(v: unknown, max = 6): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, max) : [];
}

export const generateDailyBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const ctx = (input ?? {}) as DailyBriefContext;
    return { ctx };
  })
  .handler(async ({ data }): Promise<DailyBrief> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      throw new BriefNotConnectedError("LOVABLE_API_KEY חסר בשרת.");
    }

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `להלן קונטקסט המצב של המשתמש להיום. השב JSON בלבד.\n\n${JSON.stringify(data.ctx)}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch (e) {
      throw new BriefNotConnectedError(`לא ניתן להגיע ל-AI: ${(e as Error).message}`);
    }
    const duration = Date.now() - started;

    if (res.status === 402) throw new BriefNotConnectedError("אזלו זיכויי ה-AI.");
    if (res.status === 429) throw new BriefNotConnectedError("יותר מדי בקשות ל-AI, נסה שוב.");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new BriefNotConnectedError(`שגיאת ספק (${res.status}): ${body.slice(0, 180)}`);
    }

    const json = await res.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new BriefNotConnectedError("תשובת AI לא תקינה.");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new BriefNotConnectedError("JSON פגום מה-AI.");
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
      hero: String(parsed.hero ?? "").trim() || "היום הגוף שלך ממתין להוראה — בוא נתחיל.",
      statusLine: String(parsed.statusLine ?? "").trim() || "Viora עוקב אחריך בזמן אמת.",
      analysis,
      supplementAnalysis,
      wellDone: arr(parsed.wellDone),
      improve: arr(parsed.improve),
      mission: arr(parsed.mission),
      learned: arr(parsed.learned),
      calorieVerdict: String(parsed.calorieVerdict ?? "").trim(),
      diagnostics: { model: MODEL, duration_ms: duration },
    };
  });
