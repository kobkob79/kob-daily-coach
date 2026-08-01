/** Body measurements & weight history (permanent, chronological). */
import { supabase, unwrap, requireUserId } from "./base";
import type {
  BodyMeasurement,
  BodyMeasurementInsert,
  WeightEntry,
  WeightEntryInsert,
} from "@/types";

export const measurementsService = {
  async listMeasurements(limit = 200): Promise<BodyMeasurement[]> {
    return unwrap(
      await supabase
        .from("body_measurements")
        .select("*")
        .order("measured_on", { ascending: false })
        .limit(limit),
    );
  },

  async addMeasurement(
    input: Omit<BodyMeasurementInsert, "user_id">,
  ): Promise<BodyMeasurement> {
    const user_id = await requireUserId();
    return unwrap(
      await supabase.from("body_measurements").insert({ ...input, user_id }).select("*").single(),
    );
  },

  async listWeights(limit = 365): Promise<WeightEntry[]> {
    return unwrap(
      await supabase
        .from("weights_history")
        .select("*")
        .order("measured_on", { ascending: false })
        .limit(limit),
    );
  },

  async addWeight(input: Omit<WeightEntryInsert, "user_id">): Promise<WeightEntry> {
    const user_id = await requireUserId();
    return unwrap(
      await supabase.from("weights_history").insert({ ...input, user_id }).select("*").single(),
    );
  },

  async latestWeight(): Promise<WeightEntry | null> {
    const { data, error } = await supabase
      .from("weights_history")
      .select("*")
      .order("measured_on", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};
