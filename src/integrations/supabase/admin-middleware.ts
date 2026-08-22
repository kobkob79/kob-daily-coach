import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

export class AdminForbiddenError extends Error {
  readonly statusCode = 403;

  constructor() {
    super("Forbidden");
    this.name = "AdminForbiddenError";
  }
}

async function userHasAdminRole(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("./client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) {
    console.error("[Viora Admin] Authorization lookup failed", {
      event: "admin_role_lookup_failed",
    });
    throw new AdminForbiddenError();
  }

  return data !== null;
}

export const requireAdminAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const userId = String(context.userId);

    if (!(await userHasAdminRole(userId))) {
      throw new AdminForbiddenError();
    }

    return next({
      context: {
        ...context,
        isAdmin: true as const,
      },
    });
  });
