/**
 * QA authorization + reset helpers.
 *
 * A user is a QA/tester if:
 *   1. Their email matches `VITE_QA_EMAILS` (comma-separated list), OR
 *   2. `import.meta.env.DEV` is true (local dev).
 *
 * All reset helpers scope every mutation to the currently authenticated
 * user_id — never touch another user's data.
 */
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { setMemory } from "@/lib/ai-memory";
import { resetOnboarding, resetLifeProfile } from "@/lib/life-profile";

const RAW_QA_EMAILS = (import.meta.env.VITE_QA_EMAILS as string | undefined) ?? "";
const QA_EMAIL_SET = new Set(
  RAW_QA_EMAILS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);

export function isQAEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  if (import.meta.env.DEV) return true;
  return QA_EMAIL_SET.has(email.trim().toLowerCase());
}

/** True when the currently signed-in user is authorized to see QA tools. */
export async function checkIsQAUser(): Promise<boolean> {
  const { data } = await supabase.auth.getUser();
  return isQAEmail(data.user?.email ?? null);
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

/** Delete only today's rows for the current user. */
export async function resetTodayData(): Promise<void> {
  const uid = await requireUserId();
  const today = format(new Date(), "yyyy-MM-dd");
  await Promise.all([
    supabase.from("daily_events").delete().eq("user_id", uid).eq("event_date", today),
    supabase.from("nutrition_entries").delete().eq("user_id", uid).eq("date", today),
    supabase.from("workouts").delete().eq("user_id", uid).eq("date", today),
    supabase.from("health_logs").delete().eq("user_id", uid).eq("date", today),
  ]);
}

/** Mark the intro video as unseen for the current user. */
export async function resetFirstLaunchVideo(): Promise<void> {
  await setMemory("first_launch_video_seen" as never, false);
}

/**
 * Full QA account reset — wipes ALL rows for the current user across
 * every user-scoped table, plus resets profile/onboarding. Never touches
 * another user (all queries filter by user_id).
 */
export async function resetFullQAAccount(): Promise<void> {
  const uid = await requireUserId();
  const tables = [
    "ai_memory",
    "body_photos",
    "daily_events",
    "daily_notes",
    "health_logs",
    "meal_favorites",
    "nutrition_entries",
    "shift_config",
    "vision_captures",
    "workout_sets",
    "workout_template_exercises",
    "workout_templates",
    "workouts",
    "exercises",
  ] as const;
  await Promise.all(
    tables.map((tbl) =>
      supabase.from(tbl as never).delete().eq("user_id", uid),
    ),
  );
  await resetOnboarding();
  await resetLifeProfile();
}

/** Insert a few deterministic demo rows for today so the UI has something to render. */
export async function seedDemoDay(): Promise<void> {
  const uid = await requireUserId();
  const today = format(new Date(), "yyyy-MM-dd");
  const now = new Date();
  await Promise.all([
    supabase.from("nutrition_entries").insert([
      {
        user_id: uid,
        date: today,
        biological_day: today,
        meal_time: "08:00:00",
        meal: "breakfast",
        meal_type: "בוקר",
        food_name: "אומלט + טוסט מלא",
        calories: 480,
        protein_g: 32,
        carbs_g: 40,
        fat_g: 18,
        source: "qa_seed",
      },
      {
        user_id: uid,
        date: today,
        biological_day: today,
        meal_time: "13:30:00",
        meal: "lunch",
        meal_type: "צהריים",
        food_name: "חזה עוף + אורז + סלט",
        calories: 720,
        protein_g: 55,
        carbs_g: 68,
        fat_g: 20,
        source: "qa_seed",
      },
    ] as never),
    supabase.from("daily_events").insert([
      {
        user_id: uid,
        kind: "water",
        amount: 500,
        unit: "ml",
        emoji: "💧",
        event_date: today,
        biological_day: today,
        event_time: now.toISOString(),
      },
      {
        user_id: uid,
        kind: "water",
        amount: 750,
        unit: "ml",
        emoji: "💧",
        event_date: today,
        biological_day: today,
        event_time: now.toISOString(),
      },
      {
        user_id: uid,
        kind: "sleep",
        amount: 7.5,
        unit: "h",
        emoji: "🌙",
        event_date: today,
        biological_day: today,
        event_time: now.toISOString(),
      },
    ] as never),
  ]);
}
