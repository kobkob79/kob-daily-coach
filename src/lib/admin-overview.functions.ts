import { createServerFn } from "@tanstack/react-start";

import { requireAdminAuth } from "@/integrations/supabase/admin-middleware";

export interface AdminSystemOverview {
  environment: "development" | "production" | "test" | "unknown";
  role: "admin";
  ai: {
    provider: "mock" | "openai" | "not_configured" | "invalid";
    configured: boolean;
    model: string;
    maxOutputTokens: number;
    timeoutMs: number;
    maxRetries: 0;
  };
  advisorVersions: readonly string[];
}

function resolveEnvironment(): AdminSystemOverview["environment"] {
  if (process.env.NODE_ENV === "development") return "development";
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "test") return "test";
  return "unknown";
}

export const getAdminSystemOverview = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(async (): Promise<AdminSystemOverview> => {
    const [{ ADVISOR_CONFIGS }, config] = await Promise.all([
      import("./advisor-core/configs"),
      import("./advisor-core/server/config.server"),
    ]);

    let provider: AdminSystemOverview["ai"]["provider"];
    try {
      provider = config.getVioraAIProvider();
    } catch {
      provider = process.env.VIORA_AI_PROVIDER?.trim() ? "invalid" : "not_configured";
    }

    const configured =
      provider === "mock" || (provider === "openai" && Boolean(process.env.OPENAI_API_KEY?.trim()));

    return {
      environment: resolveEnvironment(),
      role: "admin",
      ai: {
        provider,
        configured,
        model: config.VIORA_ADVISOR_MODEL,
        maxOutputTokens: config.VIORA_ADVISOR_MAX_OUTPUT_TOKENS,
        timeoutMs: config.VIORA_ADVISOR_REQUEST_TIMEOUT_MS,
        maxRetries: 0,
      },
      advisorVersions: Object.values(ADVISOR_CONFIGS).map((advisor) => advisor.version),
    };
  });
