import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseAsUser } from "../supabase";

export default defineTool({
  name: "log_water",
  title: "Log water",
  description: "Log a water intake event in millilitres for the signed-in user.",
  inputSchema: {
    amount_ml: z.number().int().min(1).max(5000).describe("Millilitres of water."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ amount_ml }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await supabaseAsUser(ctx)
      .from("daily_events")
      .insert({
        user_id: ctx.getUserId(),
        kind: "water",
        amount: amount_ml,
        unit: "ml",
        emoji: "💧",
      })
      .select()
      .single();
    if (error)
      return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Logged ${amount_ml} ml` }],
      structuredContent: { event: data },
    };
  },
});
