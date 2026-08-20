import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const generateAdvisorResponseServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => input)
  .handler(async ({ data, context }) => {
    const { generateQuotaProtectedAdvisorResponse } = await import(
      "@/lib/advisor-core/server/quota-flow.server"
    );

    return generateQuotaProtectedAdvisorResponse(
      String(context.userId),
      data,
    );
  });
