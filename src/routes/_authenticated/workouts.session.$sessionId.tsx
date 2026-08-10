/**
 * Active Workout — layout wrapper.
 *
 * The overview lives in the sibling `.index.tsx` route; child routes
 * (exercise detail, summary) render here through <Outlet />. Keeping this
 * as a bare layout is what lets those children actually mount instead of
 * being shadowed by the overview UI.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";

import { RestTimerProvider } from "@/components/workouts/RestTimerProvider";

export const Route = createFileRoute("/_authenticated/workouts/session/$sessionId")({
  component: WorkoutSessionLayout,
});

function WorkoutSessionLayout() {
  const { sessionId } = Route.useParams();
  // The rest timer runtime is owned here, so it keeps running (and keeps
  // alerting) while the athlete moves between the overview and exercises.
  return (
    <RestTimerProvider sessionId={sessionId}>
      <Outlet />
    </RestTimerProvider>
  );
}
