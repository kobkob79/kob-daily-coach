/**
 * Developer Console launcher (/dev) — renders the module registry.
 * Ready modules link out; planned modules are dimmed placeholders.
 */
import { createFileRoute, Link } from "@tanstack/react-router";

import { DevConsoleShell } from "@/components/dev/DevConsoleShell";
import { DEV_CONSOLE_TITLE, DEV_MODULES, type DevModule } from "@/lib/dev-console";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dev/")({
  head: () => ({
    meta: [
      { title: "קונסולת מפתחים | Viora" },
      {
        name: "description",
        content: "מרכז הכלים הפנימיים של Viora — נכסים, QA ומעבדות AI.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "קונסולת מפתחים | Viora" },
      {
        property: "og:description",
        content: "מרכז הכלים הפנימיים של Viora.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DevConsoleIndex,
});

function ModuleTile({ module }: { module: DevModule }) {
  const Icon = module.icon;
  const planned = module.status === "planned";

  const body = (
    <>
      <span
        className={cn(
          "grid h-9 w-9 place-items-center rounded-xl",
          planned ? "bg-muted/30 text-muted-foreground" : "bg-primary/12 text-primary",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{module.title}</span>
        <span className="block text-[11px] text-muted-foreground">
          {module.description}
        </span>
      </span>
      {planned && (
        <span className="shrink-0 rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground">
          בקרוב
        </span>
      )}
    </>
  );

  const base =
    "flex items-center gap-3 rounded-2xl border px-4 py-3 transition";

  if (planned || !module.to) {
    return (
      <div
        aria-disabled
        className={cn(base, "border-border/40 bg-card/30 opacity-60")}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      to={module.to}
      className={cn(base, "border-border/60 bg-card/60 hover:border-primary/40")}
    >
      {body}
    </Link>
  );
}

function DevConsoleIndex() {
  return (
    <DevConsoleShell
      title={DEV_CONSOLE_TITLE}
      subtitle="כלים פנימיים — סביבת פיתוח בלבד"
    >
      <div className="space-y-2 pb-8">
        {DEV_MODULES.map((m) => (
          <ModuleTile key={m.id} module={m} />
        ))}
      </div>
    </DevConsoleShell>
  );
}
