import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/integrations/supabase/admin-middleware";

export const requireAdminAccessServer = createServerFn({ method: "GET" })
  .middleware([requireAdminAuth])
  .handler(() => ({ allowed: true as const }));
