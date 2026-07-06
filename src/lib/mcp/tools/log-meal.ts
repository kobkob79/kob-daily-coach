import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAsUser } from "../supabase";

export default defineTool({
  name: "log_meal",
  title: "Log meal",
  description:
    "Log a nutrition entry for the signed-in user. Provide the food name plus optional macros. `meal` is one of breakfast|lunch|dinner|snack.",
  inputSchema: {
    food_name: z.string().min(1),
    meal: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("snack"),
    calories: z.number().nonnegative().optional(),
    protein_g: z.number().nonnegative().optional(),
    carbs_g: z.number().nonnegative().optional(),
    fat_g: z.number().nonnegative().optional(),
    fiber_g: z.number().nonnegative().optional(),
    notes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await supabaseAsUser(ctx)
      .from("nutrition_entries")
      .insert({
        user_id: ctx.getUserId(),
        food_name: input.food_name,
        meal: input.meal,
        calories: input.calories ?? null,
        protein_g: input.protein_g ?? null,
        carbs_g: input.carbs_g ?? null,
        fat_g: input.fat_g ?? null,
        fiber_g: input.fiber_g ?? null,
        notes: input.notes ?? null,
        source: "mcp",
      })
      .select()
      .single();
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Logged meal: ${input.food_name}` }],
      structuredContent: { entry: data },
    };
  },
});
