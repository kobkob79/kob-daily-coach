/**
 * Home Widget Framework (VIORA-HOME-IMPLEMENTATION-001)
 *
 * Single reusable container for every Home Command Center widget.
 * Guarantees consistent spacing, rounded glass surfaces and a shared
 * header pattern, and is intentionally future-ready for:
 *  • dynamic reordering (see src/lib/home-layout.ts)
 *  • collapsing (`collapsible` / `defaultCollapsed`)
 *  • drag handles (the header is a stable slot)
 *
 * UI only — no data fetching, no AI.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HomeWidgetProps {
  /** Hebrew section title. Omit for chromeless widgets (e.g. the Hero). */
  title?: string;
  /** Small trailing hint or link on the right of the header. */
  action?: ReactNode;
  /** Allow the user to collapse the widget body. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  /** Render the body inside a glass card. Set false when children bring their own cards. */
  bare?: boolean;
  className?: string;
  children: ReactNode;
}

export function HomeWidget({
  title,
  action,
  collapsible = false,
  defaultCollapsed = false,
  bare = false,
  className,
  children,
}: HomeWidgetProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className={cn("animate-stagger", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          {collapsible ? (
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className="flex items-center gap-1.5 text-start"
              aria-expanded={!collapsed}
            >
              <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-300",
                  collapsed && "-rotate-90 rtl:rotate-90",
                )}
              />
            </button>
          ) : (
            title && <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
          )}
          {action && <div className="shrink-0 text-[11px] font-medium">{action}</div>}
        </div>
      )}

      {!collapsed && (bare ? children : <div className="glass-tile p-5">{children}</div>)}
    </section>
  );
}
