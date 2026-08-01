/** User goals. */
import { supabase, unwrap, requireUserId } from "./base";
import type { Goal, GoalInsert, GoalUpdate } from "@/types";

export const goalsService = {
  async list(status?: string): Promise<Goal[]> {
    let query = supabase.from("goals").select("*").order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    return unwrap(await query);
  },

  async create(input: Omit<GoalInsert, "user_id">): Promise<Goal> {
    const user_id = await requireUserId();
    return unwrap(await supabase.from("goals").insert({ ...input, user_id }).select("*").single());
  },

  async update(id: string, patch: GoalUpdate): Promise<Goal> {
    return unwrap(await supabase.from("goals").update(patch).eq("id", id).select("*").single());
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) throw error;
  },
};
