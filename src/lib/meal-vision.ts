/**
 * Meal-photo AI analysis — detailed ingredient recognition with
 * nutritional education.
 *
 * Returns one entry per detected food (e.g. "בטטה", "חזה עוף", "אורז מלא")
 * instead of a single generic macro block. Each ingredient carries its own
 * calories/macros, a list of key nutrients and short educational strings
 * explaining what each nutrient contributes to the body.
 *
 * All text is in Hebrew. No medical claims — phrases like "תורם ל...",
 * "חשוב עבור...", "מסייע ל...".
 */

export interface MealIngredient {
  name: string;                // "בטטה"
  quantity: string;            // "150g" or "כוס"
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: number;          // 0..1
  nutrients: string[];         // ["פחמימות מורכבות","סיבים תזונתיים","אשלגן","ויטמין A"]
  education: string[];         // ["פחמימות מורכבות: מספקות אנרגיה יציבה..."]
}

export interface MealAnalysis {
  dish: string;
  ingredients_text: string;    // comma-joined for legacy fields
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: number;
  ingredients: MealIngredient[];
  placeholder?: boolean;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read failed"));
    r.onloadend = () => resolve(r.result as string);
    r.readAsDataURL(file);
  });
}

const PLACEHOLDER_ING: MealIngredient = {
  name: "רכיב לא זוהה",
  quantity: "מנה",
  calories: 250,
  protein_g: 15,
  carbs_g: 25,
  fat_g: 8,
  fiber_g: 3,
  confidence: 0.3,
  nutrients: ["חלבון", "פחמימות"],
  education: [
    "חלבון: תורם לבניית שריר, לתחושת שובע ולתפקוד תקין של הגוף.",
    "פחמימות: מספקות אנרגיה זמינה לפעילות היום־יום.",
  ],
};

const PLACEHOLDER: MealAnalysis = {
  dish: "ארוחה מעורבת",
  ingredients_text: "חלבון, פחמימה, ירקות",
  calories: 480,
  protein_g: 32,
  carbs_g: 45,
  fat_g: 16,
  fiber_g: 6,
  confidence: 0.35,
  ingredients: [PLACEHOLDER_ING],
  placeholder: true,
};

const SYSTEM_PROMPT = `אתה תזונאי-AI בעברית. קבל תמונת ארוחה וזהה את המרכיבים בפירוט.
לכל מרכיב שזוהה החזר:
- name: שם המאכל בעברית (למשל "בטטה", "חזה עוף", "אורז מלא", "קוטג' 5%", "ביצה", "אבוקדו").
  אל תחזיר קטגוריות כלליות כמו "פחמימה" או "חלבון" — תמיד את השם האמיתי.
- quantity: הערכת כמות בעברית (למשל "150g", "כוס", "פרוסה", "כף").
- calories, protein_g, carbs_g, fat_g, fiber_g: מספרים בלבד לפי הכמות המוערכת.
- confidence: 0 עד 1 לפי בטחון הזיהוי.
- nutrients: מערך של 2 עד 5 רכיבים תזונתיים בולטים במרכיב הזה
  (למשל "פחמימות מורכבות", "חלבון מלא", "סיבים תזונתיים", "אשלגן",
   "ויטמין A", "ויטמין C", "אומגה 3", "ברזל", "סידן", "מגנזיום",
   "שומן חד־בלתי־רווי", "אנטיאוקסידנטים").
- education: מערך משפטים קצרים בעברית, אחד לכל nutrient באותו הסדר.
  כל משפט מסביר בקצרה מה הרכיב תורם לגוף.
  השתמש בניסוחים "תורם ל...", "חשוב עבור...", "מסייע ל...".
  אל תיתן טענות רפואיות, אל תבטיח ריפוי, אל תמליץ על תרופות.

בנוסף החזר ברמת ה-JSON:
- dish: שם קצר של הארוחה כולה בעברית.
- totals: אובייקט עם calories, protein_g, carbs_g, fat_g, fiber_g (סכום של כל המרכיבים).
- confidence: מספר כללי 0..1.

החזר JSON תקין בלבד, ללא טקסט נוסף, בפורמט:
{
  "dish": "...",
  "confidence": 0.8,
  "totals": { "calories":..., "protein_g":..., "carbs_g":..., "fat_g":..., "fiber_g":... },
  "ingredients": [
    { "name":"בטטה", "quantity":"150g", "calories":135, "protein_g":2, "carbs_g":31, "fat_g":0, "fiber_g":5, "confidence":0.9,
      "nutrients":["פחמימות מורכבות","סיבים תזונתיים","אשלגן","ויטמין A"],
      "education":[
        "פחמימות מורכבות: מספקות אנרגיה יציבה לאורך זמן ומסייעות לשמור על רמות סוכר מאוזנות.",
        "סיבים תזונתיים: תורמים לעיכול תקין, לתחושת שובע ולבריאות המעי.",
        "אשלגן: חשוב עבור תפקוד השרירים, פעילות עצבית ומאזן נוזלים.",
        "ויטמין A: תורם לראייה תקינה, לתפקוד מערכת החיסון ולבריאות העור."
      ]
    }
  ]
}`;

function num(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
}

function normalizeIngredient(raw: unknown): MealIngredient | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = String(r.name ?? "").trim();
  if (!name) return null;
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

export async function analyzeMealImage(file: File): Promise<MealAnalysis> {
  try {
    const dataUrl = await fileToDataUrl(file);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "נתח את התמונה. זהה כל מרכיב בנפרד וכלול הסבר תזונתי לכל אחד. החזר JSON בלבד." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`gateway ${res.status}`);
    const json = await res.json();
    const raw: string = json?.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no json");
    const parsed = JSON.parse(match[0]);

    const ingredients: MealIngredient[] = Array.isArray(parsed.ingredients)
      ? (parsed.ingredients.map(normalizeIngredient).filter(Boolean) as MealIngredient[])
      : [];

    if (ingredients.length === 0) throw new Error("no ingredients");

    const totalsSrc = (parsed.totals ?? {}) as Record<string, unknown>;
    const sum = (k: keyof MealIngredient) =>
      ingredients.reduce((s, i) => s + Number(i[k] ?? 0), 0);
    const totalsFallback = {
      calories: sum("calories"),
      protein_g: sum("protein_g"),
      carbs_g: sum("carbs_g"),
      fat_g: sum("fat_g"),
      fiber_g: sum("fiber_g"),
    };

    return {
      dish: String(parsed.dish ?? PLACEHOLDER.dish),
      ingredients_text: ingredients.map((i) => `${i.name} (${i.quantity})`).join(", "),
      calories: num(totalsSrc.calories, totalsFallback.calories),
      protein_g: num(totalsSrc.protein_g, totalsFallback.protein_g),
      carbs_g: num(totalsSrc.carbs_g, totalsFallback.carbs_g),
      fat_g: num(totalsSrc.fat_g, totalsFallback.fat_g),
      fiber_g: num(totalsSrc.fiber_g, totalsFallback.fiber_g),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.7)),
      ingredients,
    };
  } catch {
    return { ...PLACEHOLDER, ingredients: [{ ...PLACEHOLDER_ING }] };
  }
}
