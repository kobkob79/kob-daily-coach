/**
 * Life Profile — the generic, multi-user foundation.
 *
 * Purpose: give every module (nutrition, sleep, workouts, AI coach,
 * reminders, shift calendar, …) ONE canonical place to read the
 * user's personal facts from, instead of duplicating them.
 *
 * Everything here is deliberately generic: no company, no shift
 * pattern, no domain assumption is hardcoded. Shift-work users
 * describe their cycle themselves (cycle length + counts) and the
 * shift module derives the schedule from those numbers.
 *
 * Persistence: fields live on the existing `profiles` row and on
 * `shift_config` (only when the user says they are a shift worker).
 * Onboarding progress is stored on `profiles.onboarding_step` so
 * the wizard can be resumed at any time.
 */
import { supabase } from "@/integrations/supabase/client";

export type LifeContext =
  | "employee"
  | "shift_worker"
  | "student"
  | "self_employed"
  | "parent_home"
  | "retired"
  | "other";

export const LIFE_CONTEXTS: { key: LifeContext; labelKey: string }[] = [
  { key: "employee",       labelKey: "life.ctx.employee" },
  { key: "shift_worker",   labelKey: "life.ctx.shift_worker" },
  { key: "student",        labelKey: "life.ctx.student" },
  { key: "self_employed",  labelKey: "life.ctx.self_employed" },
  { key: "parent_home",    labelKey: "life.ctx.parent_home" },
  { key: "retired",        labelKey: "life.ctx.retired" },
  { key: "other",          labelKey: "life.ctx.other" },
];

export type Sex = "male" | "female" | "other";

export interface LifeProfile {
  user_id: string;
  first_name: string | null;
  birth_date: string | null;
  sex: Sex | null;
  height_cm: number | null;
  weight_kg: number | null;
  life_context: LifeContext | null;
  shift_cycle: ShiftCycle | null;
  onboarding_completed_at: string | null;
  onboarding_step: number;
}

export interface ShiftCycle {
  cycle_length: number;
  day_shifts: number;
  night_shifts: number;
  off_days: number;
  anchor_date: string; // when the current cycle started (defaults to today)
}

/** Total ordered onboarding steps, used by the wizard for progress + resume. */
export const ONBOARDING_STEPS = [
  "first_name",
  "birth_date",
  "sex",
  "height",
  "weight",
  "life_context",
  "shift_cycle", // only reached when life_context === "shift_worker"
  "done",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export async function fetchLifeProfile(): Promise<LifeProfile | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;

  const [{ data: p }, { data: s }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle(),
    supabase.from("shift_config").select("*").eq("user_id", u.user.id).maybeSingle(),
  ]);

  const profile = p as unknown as {
    first_name: string | null;
    birth_date: string | null;
    gender: string | null;
    height_cm: number | null;
    current_weight_kg: number | null;
    life_context: string | null;
    onboarding_completed_at: string | null;
    onboarding_step: number | null;
  } | null;

  const shift = s as unknown as {
    cycle_length: number | null;
    day_shifts: number | null;
    night_shifts: number | null;
    off_days: number | null;
    anchor_date: string | null;
  } | null;

  const shift_cycle: ShiftCycle | null =
    shift && shift.cycle_length && shift.anchor_date
      ? {
          cycle_length: shift.cycle_length,
          day_shifts: shift.day_shifts ?? 0,
          night_shifts: shift.night_shifts ?? 0,
          off_days: shift.off_days ?? 0,
          anchor_date: shift.anchor_date,
        }
      : null;

  return {
    user_id: u.user.id,
    first_name: profile?.first_name ?? null,
    birth_date: profile?.birth_date ?? null,
    sex: (profile?.gender as Sex | null) ?? null,
    height_cm: profile?.height_cm ?? null,
    weight_kg: profile?.current_weight_kg ?? null,
    life_context: (profile?.life_context as LifeContext | null) ?? null,
    shift_cycle,
    onboarding_completed_at: profile?.onboarding_completed_at ?? null,
    onboarding_step: profile?.onboarding_step ?? 0,
  };
}

export async function patchLifeProfile(patch: {
  first_name?: string | null;
  birth_date?: string | null;
  sex?: Sex | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  life_context?: LifeContext | null;
  onboarding_step?: number;
  onboarding_completed_at?: string | null;
}): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const row: Record<string, unknown> = { id: u.user.id };
  if (patch.first_name !== undefined) row.first_name = patch.first_name;
  if (patch.birth_date !== undefined) row.birth_date = patch.birth_date;
  if (patch.sex !== undefined) row.gender = patch.sex;
  if (patch.height_cm !== undefined) row.height_cm = patch.height_cm;
  if (patch.weight_kg !== undefined) row.current_weight_kg = patch.weight_kg;
  if (patch.life_context !== undefined) row.life_context = patch.life_context;
  if (patch.onboarding_step !== undefined) row.onboarding_step = patch.onboarding_step;
  if (patch.onboarding_completed_at !== undefined)
    row.onboarding_completed_at = patch.onboarding_completed_at;

  const { error } = await supabase
    .from("profiles")
    .upsert(row as never, { onConflict: "id" });
  if (error) throw error;
}

export async function saveShiftCycle(cycle: ShiftCycle): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not signed in");
  const { error } = await supabase.from("shift_config").upsert(
    {
      user_id: u.user.id,
      anchor_date: cycle.anchor_date,
      anchor_shift: "day",
      pattern: "generic",
      cycle_length: cycle.cycle_length,
      day_shifts: cycle.day_shifts,
      night_shifts: cycle.night_shifts,
      off_days: cycle.off_days,
    } as never,
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

/**
 * Whether onboarding needs to run. We consider it "done" only when the
 * user has an explicit completion timestamp — this way a partial profile
 * from a previous version still triggers the wizard once.
 */
export function needsOnboarding(p: LifeProfile | null): boolean {
  return !p || !p.onboarding_completed_at;
}

/**
 * Compute the next unfinished step, so the wizard resumes where the user left off.
 */
export function nextOnboardingStep(p: LifeProfile | null): OnboardingStep {
  if (!p) return "first_name";
  if (!p.first_name) return "first_name";
  if (!p.birth_date) return "birth_date";
  if (!p.sex) return "sex";
  if (!p.height_cm) return "height";
  if (!p.weight_kg) return "weight";
  if (!p.life_context) return "life_context";
  if (p.life_context === "shift_worker" && !p.shift_cycle) return "shift_cycle";
  return "done";
}
