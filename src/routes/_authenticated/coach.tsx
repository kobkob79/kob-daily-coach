import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/coach")({
  component: CoachLayout,
});

function CoachLayout() {
  return <Outlet />;
}
