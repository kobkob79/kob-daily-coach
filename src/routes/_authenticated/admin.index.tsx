import { createFileRoute } from "@tanstack/react-router";

import { ManagementCenter } from "@/components/admin/ManagementCenter";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [{ title: "Viora Management Center" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  return <ManagementCenter />;
}
