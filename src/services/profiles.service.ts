/** Profile / digital-twin data. */
import { supabase, unwrap, requireUserId } from "./base";
import type { Profile, ProfileUpdate } from "@/types";

export const profilesService = {
  async getMine(): Promise<Profile | null> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async upsertMine(patch: ProfileUpdate): Promise<Profile> {
    const userId = await requireUserId();
    return unwrap(
      await supabase
        .from("profiles")
        .upsert({ ...patch, id: userId })
        .select("*")
        .single(),
    );
  },
};
