/**
 * AI Context — the typed snapshot passed to the AI conversation flow so
 * responses can be tailored to the screen the user asked from.
 *
 * Keep this deliberately narrow: it must NEVER include unrelated private
 * data (auth tokens, other users' rows, raw supabase secrets). The
 * conversation layer serialises this object into a URL search param so
 * that keeping it small also keeps URLs short.
 */

export type AIScreen =
  | "home"
  | "nutrition"
  | "meals"
  | "workouts"
  | "workout_session"
  | "hydration"
  | "health"
  | "shift"
  | "profile"
  | "journal"
  | "capture"
  | "other";

export interface AIHomeContext {
  screen: "home";
  shift: string | null;
  sleepHours: number | null;
  waterMl: number | null;
  waterTargetMl: number | null;
  proteinG: number | null;
  proteinTargetG: number | null;
  workoutTodayMinutes: number | null;
}

export interface AINutritionContext {
  screen: "nutrition" | "meals";
  caloriesToday: number | null;
  calorieTarget: number | null;
  proteinG: number | null;
  proteinTargetG: number | null;
  lastMealNames: string[];
}

export interface AIWorkoutContext {
  screen: "workouts" | "workout_session";
  todayWorkoutName: string | null;
  completedExercises: number | null;
  currentExercise: string | null;
}

export interface AIGenericContext {
  screen: Exclude<AIScreen, "home" | "nutrition" | "meals" | "workouts" | "workout_session">;
}

export type AIContext =
  | AIHomeContext
  | AINutritionContext
  | AIWorkoutContext
  | AIGenericContext;

/** Map a router pathname to the appropriate AIScreen. */
export function screenFromPath(pathname: string): AIScreen {
  if (pathname.startsWith("/dashboard")) return "home";
  if (pathname.startsWith("/nutrition")) return "nutrition";
  if (pathname.startsWith("/meals")) return "meals";
  if (pathname.startsWith("/workout-session")) return "workout_session";
  if (pathname.startsWith("/workouts") || pathname.startsWith("/workout-templates"))
    return "workouts";
  if (pathname.startsWith("/hydration")) return "hydration";
  if (pathname.startsWith("/health")) return "health";
  if (pathname.startsWith("/shift")) return "shift";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/journal")) return "journal";
  if (pathname.startsWith("/capture")) return "capture";
  return "other";
}

/** Encode an AI context object for a URL search param. */
export function encodeAIContext(ctx: AIContext): string {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(ctx))));
  } catch {
    return "";
  }
}

export function decodeAIContext(raw: string | null | undefined): AIContext | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(raw)))) as AIContext;
  } catch {
    return null;
  }
}
