/**
 * Server function that performs REAL AI Vision meal analysis via the
 * Lovable AI Gateway. No fake fallbacks — if the gateway is not reachable
 * or LOVABLE_API_KEY is missing, this throws an error carrying a
 * VISION_NOT_CONNECTED marker so the UI can tell the user explicitly.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ServerMealIngredient {
  name: string;
  quantity: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: number;
  nutrients: string[];
  education: string[];
}

export interface ServerMealAnalysis {
  dish: string;
  confidence: number;
  ingredients: ServerMealIngredient[];
  quality: {
    score: number;
    reasons: string[];
    suggestions: string[];
  };
  diagnostics: {
    provider: string;
    model: string;
    duration_ms: number;
    visionConnected: true;
  };
}

const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `אתה תזונאי AI מקצועי בעברית. קבל תמונת ארוחה וזהה כל מרכיב אמיתי בשמו העברי (בטטה, טונה, אורז, ביצה, עגבנייה, אבוקדו, קוטג', חזה עוף וכו'). לעולם אל תחזיר קטגוריות גנריות כמו "חלבון" או "פחמימה". אם התמונה אינה של אוכל — החזר ingredients ריק.

לכל מרכיב החזר:
- name (שם המזון האמיתי בעברית)
- quantity (הערכה קצרה: "150g", "כוס", "פרוסה")
- calories, protein_g, carbs_g, fat_g, fiber_g (מספרים בלבד)
- confidence (0..1)
- nutrients: 2–5 רכיבים תזונתיים בולטים (למשל "חלבון מלא","אומגה 3","ויטמין B12","סיבים תזונתיים","אשלגן","ויטמין A","ברזל","סידן","שומן חד בלתי רווי","אנטיאוקסידנטים")
- education: משפט לכל nutrient באותו סדר, בעברית פשוטה, בסגנון "תורם ל...", "חשוב עבור...", "מסייע ל...", "עשוי לתרום ל...". ללא טענות רפואיות.

בנוסף החזר:
- dish: שם קצר לארוחה
- confidence כללי 0..1
- quality: { score: 0..100, reasons: string[] (עברית, מתחיל ב-"✅" או "⚠"), suggestions: string[] (עברית, המלצות מעשיות) }

החזר JSON תקין בלבד ללא טקסט מסביב:
{"dish":"...","confidence":0.85,"ingredients":[...],"quality":{"score":88,"reasons":["..."],"suggestions":["..."]}}`;

export class VisionNotConnectedError extends Error {
  code = "VISION_NOT_CONNECTED" as const;
  constructor(message: string) {
    super(message);
  }
}

function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
}

function normIngredient(raw: unknown): ServerMealIngredient | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = String(r.name ?? "").trim();
  if (!name) return null;
  const generic = /^(חלבון|פחמימה|שומן|רכיב לא זוהה|unknown)$/i.test(name);
  if (generic) return null;
  const nutrients = Array.isArray(r.nutrients)
    ? r.nutrients.map((x) => String(x)).filter(Boolean).slice(0, 6)
    : [];
  const education = Array.isArray(r.education)
    ? r.education.map((x) => String(x)).filter(Boolean).slice(0, 6)
    : [];
  return {
    name,
    quantity: String(r.quantity ?? "מנה"),
    calories: num(r.calories),
    protein_g: num(r.protein_g),
    carbs_g: num(r.carbs_g),
    fat_g: num(r.fat_g),
    fiber_g: num(r.fiber_g),
    confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.6)),
    nutrients,
    education,
  };
}

export const analyzeMealServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const i = (input ?? {}) as Record<string, unknown>;
    const dataUrl = String(i.dataUrl ?? "");
    if (!dataUrl.startsWith("data:image/")) {
      throw new Error("Invalid image data");
    }
    const corrections = Array.isArray(i.corrections)
      ? (i.corrections as Array<{ wrong?: string; correct?: string }>)
          .filter((c) => c && c.correct)
          .slice(0, 20)
      : [];
    return { dataUrl, corrections };
  })
  .handler(async ({ data }): Promise<ServerMealAnalysis> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      throw new VisionNotConnectedError(
        "LOVABLE_API_KEY חסר — AI Vision לא מוגדר בשרת.",
      );
    }

    const correctionsHint =
      data.corrections.length > 0
        ? `\n\nזיכרון תיקונים אישי של המשתמש (העדף שמות אלה כשמתאים לתמונה):\n${data.corrections
            .map((c) => `- ${c.wrong ?? "?"} → ${c.correct}`)
            .join("\n")}`
        : "";

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
            { role: "system", content: SYSTEM_PROMPT + correctionsHint },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "נתח את התמונה. זהה כל מרכיב אמיתי בשמו העברי, ספק ערכים תזונתיים, הסבר תרומה לגוף וציון איכות. החזר JSON בלבד.",
                },
                { type: "image_url", image_url: { url: data.dataUrl } },
              ],
            },
          ],
        }),
      });
    } catch (e) {
      throw new VisionNotConnectedError(
        `לא ניתן להגיע אל ספק ה-Vision: ${(e as Error).message}`,
      );
    }

    const duration = Date.now() - started;

    if (res.status === 402) {
      throw new VisionNotConnectedError(
        "אזל תקציב הזיכויים ל-AI. יש להוסיף זיכויים בהגדרות.",
      );
    }
    if (res.status === 429) {
      throw new VisionNotConnectedError(
        "יותר מדי בקשות ל-AI Vision — נסה שוב בעוד רגע.",
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new VisionNotConnectedError(
        `שגיאת ספק Vision (${res.status}): ${body.slice(0, 200)}`,
      );
    }

    const json = await res.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new VisionNotConnectedError("Vision החזיר תשובה לא תקינה.");
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new VisionNotConnectedError("Vision החזיר JSON פגום.");
    }

    const ingredients: ServerMealIngredient[] = Array.isArray(parsed.ingredients)
      ? (parsed.ingredients
          .map(normIngredient)
          .filter(Boolean) as ServerMealIngredient[])
      : [];

    const qualityRaw = (parsed.quality ?? {}) as Record<string, unknown>;
    const quality = {
      score: Math.max(0, Math.min(100, num(qualityRaw.score, 0))),
      reasons: Array.isArray(qualityRaw.reasons)
        ? qualityRaw.reasons.map((x) => String(x)).slice(0, 6)
        : [],
      suggestions: Array.isArray(qualityRaw.suggestions)
        ? qualityRaw.suggestions.map((x) => String(x)).slice(0, 6)
        : [],
    };

    return {
      dish: String(parsed.dish ?? "ארוחה"),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.7)),
      ingredients,
      quality,
      diagnostics: {
        provider: "Lovable AI Gateway",
        model: MODEL,
        duration_ms: duration,
        visionConnected: true,
      },
    };
  });
