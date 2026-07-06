import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getDailySummary from "./tools/get-daily-summary";
import listMeals from "./tools/list-meals";
import logWater from "./tools/log-water";
import logMeal from "./tools/log-meal";

// Direct Supabase issuer host — the .lovable.cloud proxy fails RFC 8414
// issuer matching. `VITE_SUPABASE_PROJECT_ID` is inlined by Vite at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "kobios-mcp",
  title: "KobiOS",
  version: "0.1.0",
  instructions:
    "KobiOS personal health OS. Use `get_daily_summary` for today's totals, `list_meals` for the food log, `log_water` to record hydration, and `log_meal` to add a nutrition entry.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getDailySummary, listMeals, logWater, logMeal],
});
