/**
 * Meal-photo AI analysis.
 *
 * Tries the Lovable AI Gateway with Gemini vision for real recognition;
 * if unavailable or blocked, returns a clearly-labelled placeholder result
 * so the flow never silently swallows the photo.
 */

export interface MealAnalysis {
  dish: string;
  ingredients: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: number; // 0..1
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

const PLACEHOLDER: MealAnalysis = {
  dish: "ארוחה מעורבת",
  ingredients: "חלבון, פחמימה, ירקות",
  calories: 480,
  protein_g: 32,
  carbs_g: 45,
  fat_g: 16,
  fiber_g: 6,
  confidence: 0.35,
  placeholder: true,
};

export async function analyzeMealImage(file: File): Promise<MealAnalysis> {
  try {
    const dataUrl = await fileToDataUrl(file);
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "אתה תזונאי-AI. קבל תמונת ארוחה והחזר JSON תקין בלבד עם המפתחות: dish (מחרוזת עברית), ingredients (מחרוזת עברית מופרדת בפסיקים), calories, protein_g, carbs_g, fat_g, fiber_g (כולם מספרים), confidence (0 עד 1). אל תוסיף טקסט חוץ מ־JSON.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "נתח את התמונה הבאה ותן הערכה תזונתית מיטבית." },
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
    const num = (v: unknown, d = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.round(n) : d;
    };
    return {
      dish: String(parsed.dish ?? PLACEHOLDER.dish),
      ingredients: String(parsed.ingredients ?? PLACEHOLDER.ingredients),
      calories: num(parsed.calories, PLACEHOLDER.calories),
      protein_g: num(parsed.protein_g, PLACEHOLDER.protein_g),
      carbs_g: num(parsed.carbs_g, PLACEHOLDER.carbs_g),
      fat_g: num(parsed.fat_g, PLACEHOLDER.fat_g),
      fiber_g: num(parsed.fiber_g, PLACEHOLDER.fiber_g),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.6)),
    };
  } catch {
    return { ...PLACEHOLDER };
  }
}
