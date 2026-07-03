/**
 * Client-side wrapper around the real AI Vision server function.
 *
 * NO fake analysis. If the server can't reach the Vision provider we
 * surface `visionConnected: false` with an error message; the UI must
 * show "AI Vision עדיין אינו מחובר" rather than invented ingredients.
 */
import { analyzeMealServer } from "@/lib/meal-vision.functions";
import { getMemory, setMemory } from "@/lib/ai-memory";

export interface MealIngredient {
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

export interface MealQuality {
  score: number;
  reasons: string[];
  suggestions: string[];
}

export interface MealDiagnostics {
  provider: string;
  model: string;
  duration_ms: number;
  visionConnected: boolean;
  lastError?: string;
}

export interface MealAnalysis {
  visionConnected: boolean;
  dish: string;
  ingredients_text: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: number;
  ingredients: MealIngredient[];
  quality: MealQuality;
  diagnostics: MealDiagnostics;
  error?: string;
}

export interface MealCorrection {
  wrong?: string;
  correct: string;
  at: string;
}

const CORRECTIONS_KEY = "meal_vision_corrections" as unknown as Parameters<
  typeof getMemory
>[0];

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read failed"));
    r.onloadend = () => resolve(r.result as string);
    r.readAsDataURL(file);
  });
}

export async function loadCorrections(): Promise<MealCorrection[]> {
  const v = await getMemory<MealCorrection[]>(CORRECTIONS_KEY);
  return Array.isArray(v) ? v : [];
}

export async function saveCorrections(
  next: MealCorrection[],
): Promise<void> {
  // keep last 40
  await setMemory<MealCorrection[]>(CORRECTIONS_KEY, next.slice(-40));
}

export async function appendCorrections(
  additions: MealCorrection[],
): Promise<void> {
  if (additions.length === 0) return;
  const cur = await loadCorrections();
  await saveCorrections([...cur, ...additions]);
}

function emptyAnalysis(error: string): MealAnalysis {
  return {
    visionConnected: false,
    dish: "",
    ingredients_text: "",
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    confidence: 0,
    ingredients: [],
    quality: { score: 0, reasons: [], suggestions: [] },
    diagnostics: {
      provider: "Lovable AI Gateway",
      model: "google/gemini-2.5-flash",
      duration_ms: 0,
      visionConnected: false,
      lastError: error,
    },
    error,
  };
}

export async function analyzeMealImage(file: File): Promise<MealAnalysis> {
  let dataUrl: string;
  try {
    dataUrl = await fileToDataUrl(file);
  } catch (e) {
    return emptyAnalysis(`שגיאת קריאת תמונה: ${(e as Error).message}`);
  }

  const corrections = await loadCorrections().catch(() => []);
  const started = Date.now();

  try {
    const res = await analyzeMealServer({
      data: {
        dataUrl,
        corrections: corrections.map((c) => ({ wrong: c.wrong, correct: c.correct })),
      },
    });

    const sum = (k: keyof MealIngredient) =>
      res.ingredients.reduce((s, i) => s + Number(i[k] ?? 0), 0);

    return {
      visionConnected: true,
      dish: res.dish,
      ingredients_text: res.ingredients
        .map((i) => `${i.name} (${i.quantity})`)
        .join(", "),
      calories: sum("calories"),
      protein_g: sum("protein_g"),
      carbs_g: sum("carbs_g"),
      fat_g: sum("fat_g"),
      fiber_g: sum("fiber_g"),
      confidence: res.confidence,
      ingredients: res.ingredients,
      quality: res.quality,
      diagnostics: {
        ...res.diagnostics,
        duration_ms: res.diagnostics.duration_ms || Date.now() - started,
      },
    };
  } catch (e) {
    const msg = (e as Error).message || "Vision לא מחובר";
    return emptyAnalysis(msg);
  }
}
