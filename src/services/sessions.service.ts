/** Workout sessions & sets (performed training). */
import { supabase, unwrap, requireUserId } from "./base";
import type {
  WorkoutSession,
  WorkoutSessionInsert,
  WorkoutSessionUpdate,
  WorkoutSet,
  WorkoutSetInsert,
} from "@/types";

export const sessionsService = {
  async listRecent(limit = 30): Promise<WorkoutSession[]> {
    return unwrap(
      await supabase
        .from("workout_sessions")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(limit),
    );
  },

  async getActive(): Promise<WorkoutSession | null> {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("*")
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getById(id: string): Promise<WorkoutSession | null> {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(input: Omit<WorkoutSessionInsert, "user_id">): Promise<WorkoutSession> {
    const user_id = await requireUserId();
    return unwrap(
      await supabase.from("workout_sessions").insert({ ...input, user_id }).select("*").single(),
    );
  },

  async update(id: string, patch: WorkoutSessionUpdate): Promise<WorkoutSession> {
    return unwrap(
      await supabase.from("workout_sessions").update(patch).eq("id", id).select("*").single(),
    );
  },

  async listSets(sessionId: string): Promise<WorkoutSet[]> {
    return unwrap(
      await supabase
        .from("workout_sets")
        .select("*")
        .eq("session_id", sessionId)
        .order("position", { ascending: true }),
    );
  },

  async addSet(input: Omit<WorkoutSetInsert, "user_id">): Promise<WorkoutSet> {
    const user_id = await requireUserId();
    return unwrap(
      await supabase.from("workout_sets").insert({ ...input, user_id }).select("*").single(),
    );
  },
};
