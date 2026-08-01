/**
 * Workout programs.
 *
 * Physical tables:
 *   workout_programs   -> workout_templates
 *   program_exercises  -> workout_template_exercises
 *   program_days       -> workout_plans (weekday slot -> program)
 */
import { supabase, unwrap, requireUserId } from "./base";
import type {
  WorkoutProgram,
  ProgramDay,
  ProgramExercise,
  ProgramExerciseInsert,
} from "@/types";

export const programsService = {
  async list(): Promise<WorkoutProgram[]> {
    return unwrap(
      await supabase.from("workout_templates").select("*").order("created_at", { ascending: false }),
    );
  },

  async create(name: string, notes?: string): Promise<WorkoutProgram> {
    const user_id = await requireUserId();
    return unwrap(
      await supabase
        .from("workout_templates")
        .insert({ user_id, name, notes: notes ?? null })
        .select("*")
        .single(),
    );
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("workout_templates").delete().eq("id", id);
    if (error) throw error;
  },

  /** Exercises inside a program, ordered. */
  async listExercises(programId: string): Promise<ProgramExercise[]> {
    return unwrap(
      await supabase
        .from("workout_template_exercises")
        .select("*")
        .eq("template_id", programId)
        .order("position"),
    );
  },

  async addExercise(
    input: Omit<ProgramExerciseInsert, "user_id">,
  ): Promise<ProgramExercise> {
    const user_id = await requireUserId();
    return unwrap(
      await supabase
        .from("workout_template_exercises")
        .insert({ ...input, user_id })
        .select("*")
        .single(),
    );
  },

  /** Weekly plan: weekday (0-6) -> program. */
  async listDays(): Promise<ProgramDay[]> {
    return unwrap(await supabase.from("workout_plans").select("*").order("weekday"));
  },

  async assignDay(weekday: number, programId: string | null, displayName?: string | null) {
    const user_id = await requireUserId();
    return unwrap(
      await supabase
        .from("workout_plans")
        .upsert(
          { user_id, weekday, template_id: programId, display_name: displayName ?? null },
          { onConflict: "user_id,weekday" },
        )
        .select("*")
        .single(),
    );
  },
};
