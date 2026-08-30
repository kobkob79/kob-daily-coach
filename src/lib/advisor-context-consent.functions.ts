import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DISABLED_ADVISOR_CONTEXT_CONSENT,
  type AdvisorContextConsent,
  type GetAdvisorContextConsentResult,
  type SetAdvisorContextConsentResult,
} from "./advisor-context-consent";

interface ConsentRow {
  context_sharing_enabled: boolean;
  consented_at: string | null;
  revoked_at: string | null;
}

interface ConsentQuery {
  select(columns: string): ConsentQuery;
  eq(column: string, value: string): ConsentQuery;
  maybeSingle(): Promise<{ data: ConsentRow | null; error: unknown }>;
  upsert(value: Record<string, unknown>, options: { onConflict: string }): ConsentQuery;
  single(): Promise<{ data: ConsentRow | null; error: unknown }>;
}

interface ConsentClient {
  from(table: "advisor_context_preferences"): ConsentQuery;
}

function projection(row: ConsentRow | null): AdvisorContextConsent {
  return row
    ? {
        enabled: row.context_sharing_enabled,
        consentedAt: row.consented_at,
        revokedAt: row.revoked_at,
      }
    : DISABLED_ADVISOR_CONTEXT_CONSENT;
}

function unavailable(): GetAdvisorContextConsentResult {
  return {
    status: "error",
    error: { code: "PERSISTENCE_UNAVAILABLE", retryable: true },
  };
}

export const getAdvisorContextConsentServer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GetAdvisorContextConsentResult> => {
    const client = context.supabase as unknown as ConsentClient;
    const { data, error } = await client
      .from("advisor_context_preferences")
      .select("context_sharing_enabled,consented_at,revoked_at")
      .eq("user_id", String(context.userId))
      .maybeSingle();
    return error ? unavailable() : { status: "success", data: projection(data) };
  });

const consentSchema = z.object({ enabled: z.boolean() }).strict();

export const setAdvisorContextConsentServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const result = consentSchema.safeParse(input);
    return result.success ? result.data : null;
  })
  .handler(async ({ data, context }): Promise<SetAdvisorContextConsentResult> => {
    if (!data) return unavailable();
    const now = new Date().toISOString();
    const client = context.supabase as unknown as ConsentClient;
    const result = await client
      .from("advisor_context_preferences")
      .upsert(
        {
          user_id: String(context.userId),
          context_sharing_enabled: data.enabled,
          consented_at: data.enabled ? now : null,
          revoked_at: data.enabled ? null : now,
        },
        { onConflict: "user_id" },
      )
      .select("context_sharing_enabled,consented_at,revoked_at")
      .single();
    return result.error || !result.data
      ? unavailable()
      : { status: "success", data: projection(result.data) };
  });
