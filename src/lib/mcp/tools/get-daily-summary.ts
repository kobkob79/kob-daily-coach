import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAsUser, todayISO } from "../supabase";

export default defineTool({
  name: "get_daily_summary",
  title: "Get daily summary",
  description:
    "Returns the signed-in user's totals for a given day: calories, protein/carbs/fat/fiber grams, water intake (ml), meal count, and workout count. Defaults to today.",
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
    const sb = supabaseAsUser(ctx);
    const [meals, events] = await Promise.all([
      sb
        .from("nutrition_entries")
        .select("calories,protein_g,carbs_g,fat_g,fiber_g")
        .eq("biological_day", day),
      sb.from("daily_events").select("kind,amount,unit").eq("biological_day", day),
    ]);
    if (meals.error || events.error)
      return {
        content: [
          { type: "text", text: meals.error?.message ?? events.error?.message ?? "error" },
        ],
        isError: true,
      };
    const totals = (meals.data ?? []).reduce(
      (acc, m) => ({
        calories: acc.calories + Number(m.calories ?? 0),
        protein_g: acc.protein_g + Number(m.protein_g ?? 0),
        carbs_g: acc.carbs_g + Number(m.carbs_g ?? 0),
        fat_g: acc.fat_g + Number(m.fat_g ?? 0),
        fiber_g: acc.fiber_g + Number(m.fiber_g ?? 0),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
    );
    const water_ml = (events.data ?? [])
      .filter((e) => e.kind === "water")
      .reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const workouts = (events.data ?? []).filter((e) => e.kind === "workout").length;
    const summary = {
      date: day,
      meals: meals.data?.length ?? 0,
      ...totals,
      water_ml,
      workouts,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: summary,
    };
  },
});
