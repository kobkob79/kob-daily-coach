/**
 * Internal Developer Console layout (/dev).
 *
 * Triple-gated: development build (or VITE_ENABLE_DEV_CONSOLE), an
 * authenticated session (inherited from the _authenticated layout), and a QA
 * identity. Never linked from app navigation — reachable only from the
 * QA tools card on the profile screen.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { DevConsoleUnavailable } from "@/components/dev/DevConsoleShell";
import { isDevConsoleEnabled } from "@/lib/dev-console";
import { checkIsQAUser } from "@/lib/qa";

export const Route = createFileRoute("/_authenticated/dev")({
  head: () => ({
    meta: [
      { title: "קונסולת מפתחים | Viora" },
      {
        name: "description",
        content: "אזור פיתוח פנימי של Viora לכלים ולנכסים.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DevConsoleLayout,
});

function DevConsoleLayout() {
  const enabled = isDevConsoleEnabled();
  const qaQ = useQuery({
    queryKey: ["qa-user"],
    queryFn: checkIsQAUser,
    enabled,
  });

  if (!enabled) return <DevConsoleUnavailable />;
  if (qaQ.isLoading) return null;
  if (!qaQ.data) return <DevConsoleUnavailable />;

  return <Outlet />;
}
