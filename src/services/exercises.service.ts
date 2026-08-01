/** Exercise library (shared rows have owner_id = null, plus user-owned rows). */
import { supabase, unwrap, requireUserId } from "./base";
import type { Exercise, ExerciseInsert } from "@/types";

export const exercisesService = {
  /** Shared library + the current user's own exercises (enforced by RLS). */
  async list(): Promise<Exercise[]> {
    return unwrap(await supabase.from("exercises").select("*").order("name"));
  },

  async getById(id: string): Promise<Exercise | null> {
    const { data, error } = await supabase.from("exercises").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data;
  },

  async createMine(input: Omit<ExerciseInsert, "owner_id">): Promise<Exercise> {
    const owner_id = await requireUserId();
    return unwrap(
      await supabase.from("exercises").insert({ ...input, owner_id }).select("*").single(),
    );
  },

  async deleteMine(id: string): Promise<void> {
    const { error } = await supabase.from("exercises").delete().eq("id", id);
    if (error) throw error;
  },
};
