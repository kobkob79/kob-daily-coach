/**
 * Legacy path (/dev/assets) — kept so older links keep working.
 * Redirects into the Character Assets module of the Developer Console.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dev/assets")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/dev/characters", search: search as never });
  },
  component: () => null,
});
