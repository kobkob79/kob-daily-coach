/**
 * Chrome for the internal Developer Console: RTL header, DEV badge, back
 * link and the module switcher. Uses only existing design-system primitives
 * so the app's visual style is untouched.
 */
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { SectionHeader } from "@/components/ui-kit/Section";
import { cn } from "@/lib/utils";
import { DEV_CONSOLE_TITLE, DEV_MODULES } from "@/lib/dev-console";

export function DevConsoleShell({
  title,
  subtitle,
  activeModuleId,
  children,
}: {
  title: string;
  subtitle?: string;
  activeModuleId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5 px-4 pt-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Link
          to="/profile"
          aria-label="חזרה"
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-card/60"
        >
          <ChevronLeft className="h-5 w-5 rotate-180" />
        </Link>
        <SectionHeader className="mb-0 flex-1" title={title} subtitle={subtitle} />
        <span className="rounded-full border border-warning/50 bg-warning/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-warning">
          DEV
        </span>
      </div>

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <ModuleTab to="/dev" label={DEV_CONSOLE_TITLE} active={!activeModuleId} />
        {DEV_MODULES.filter((m) => m.status === "ready" && m.to).map((m) => (
          <ModuleTab
            key={m.id}
            to={m.to!}
            label={m.title}
            active={m.id === activeModuleId}
          />
        ))}
      </nav>

      {children}
    </div>
  );
}

function ModuleTab({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
        active
          ? "border-primary/60 bg-primary/15 text-primary shadow-glow"
          : "border-border/60 bg-card/60 text-muted-foreground",
      )}
    >
      {label}
    </Link>
  );
}

/** Shown when the console is opened outside development. */
export function DevConsoleUnavailable() {
  return (
    <div className="px-4 pt-10 text-center" dir="rtl">
      <p className="text-sm font-semibold">האזור אינו זמין</p>
      <p className="mt-1 text-xs text-muted-foreground">
        קונסולת המפתחים פעילה בסביבת פיתוח בלבד.
      </p>
      <Link
        to="/dashboard"
        className="mt-4 inline-block rounded-full border border-border/60 bg-card/60 px-4 py-2 text-xs"
      >
        חזרה לדף הבית
      </Link>
    </div>
  );
}
