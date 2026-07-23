/**
 * Active Workout — layout wrapper.
 *
 * The overview lives in the sibling `.index.tsx` route; child routes
 * (exercise detail, summary) render here through <Outlet />. Keeping this
 * as a bare layout is what lets those children actually mount instead of
 * being shadowed by the overview UI.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/workouts/session/$sessionId")({
  component: WorkoutSessionLayout,
});

function WorkoutSessionLayout() {
  return <Outlet />;
}
