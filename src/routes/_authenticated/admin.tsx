/** Privileged Admin layout. Every nested admin page inherits the server guard. */
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { requireAdminAccessServer } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    try {
      await requireAdminAccessServer();
    } catch {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return <Outlet />;
}
