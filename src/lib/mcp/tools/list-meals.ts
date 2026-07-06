import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAsUser, todayISO } from "../supabase";

export default defineTool({
  name: "list_meals",
  title: "List meals",
  description:
    "List the signed-in user's nutrition entries for a given day. Defaults to today.",
  inputSchema: {
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("YYYY-MM-DD. Defaults to today."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const day = date ?? todayISO();
    const { data, error } = await supabaseAsUser(ctx)
      .from("nutrition_entries")
      .select("id,food_name,meal,meal_time,calories,protein_g,carbs_g,fat_g,fiber_g")
      .eq("biological_day", day)
      .order("meal_time", { ascending: true });
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { meals: data ?? [] },
    };
  },
});
