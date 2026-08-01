/** AI recommendations — persisted coach output with explainability. */
import { supabase, unwrap, requireUserId } from "./base";
import type { AiRecommendation, AiRecommendationInsert } from "@/types";

export const recommendationsService = {
  async list(limit = 50): Promise<AiRecommendation[]> {
    return unwrap(
      await supabase
        .from("ai_recommendations")
        .select("*")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit),
    );
  },

  async listNew(): Promise<AiRecommendation[]> {
    return unwrap(
      await supabase
        .from("ai_recommendations")
        .select("*")
        .eq("status", "new")
        .order("priority", { ascending: false }),
    );
  },

  async create(input: Omit<AiRecommendationInsert, "user_id">): Promise<AiRecommendation> {
    const user_id = await requireUserId();
    return unwrap(
      await supabase.from("ai_recommendations").insert({ ...input, user_id }).select("*").single(),
    );
  },

  async setStatus(id: string, status: string): Promise<void> {
    const { error } = await supabase.from("ai_recommendations").update({ status }).eq("id", id);
    if (error) throw error;
  },
};
