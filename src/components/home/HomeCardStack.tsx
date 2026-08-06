/**
 * Home Card Stack (VIORA-HOME-REDESIGN-001)
 *
 * Accordion framework for the Home Command Center category cards.
 *
 * Constitution:
 *  • rule 6  — every card is collapsed by default
 *  • rule 7  — only one card may be expanded at a time
 *  • rule 8  — expansion uses a smooth grid-rows animation
 *  • rule 9  — collapsed state shows exactly ONE KPI
 *  • rule 11 — each category keeps its own accent identity
 *
 * UI only: no fetching, no AI.
 */
import { createContext, useContext, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type HomeAccent = "lime" | "indigo" | "cyan" | "orange" | "rose" | "neutral";

const ACCENT_ICON: Record<HomeAccent, string> = {
  lime: "bg-primary/12 text-primary",
  indigo: "bg-accent/20 text-accent",
  cyan: "bg-sky-500/15 text-sky-300",
  orange: "bg-orange-500/15 text-orange-300",
  rose: "bg-rose-500/15 text-rose-300",
  neutral: "bg-white/8 text-foreground",
};

const ACCENT_KPI: Record<HomeAccent, string> = {
  lime: "text-primary",
  indigo: "text-accent",
  cyan: "text-sky-300",
  orange: "text-orange-300",
  rose: "text-rose-300",
  neutral: "text-foreground",
};

const ACCENT_BAR: Record<HomeAccent, string> = {
  lime: "bg-primary",
  indigo: "bg-accent",
  cyan: "bg-sky-400",
  orange: "bg-orange-400",
  rose: "bg-rose-400",
  neutral: "bg-white/40",
};

interface StackCtx {
  openId: string | null;
  toggle: (id: string) => void;
}

const Ctx = createContext<StackCtx | null>(null);

export function HomeCardStack({
  children,
  defaultOpenId = null,
  className,
}: {
  children: ReactNode;
  defaultOpenId?: string | null;
  className?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);
  return (
    <Ctx.Provider value={{ openId, toggle: (id) => setOpenId((cur) => (cur === id ? null : id)) }}>
      <div className={cn("space-y-2.5", className)}>{children}</div>
    </Ctx.Provider>
  );
}

export interface HomeCardProps {
  id: string;
  title: string;
  /** The single collapsed KPI, e.g. "2 / 4". */
  kpi: string;
  /** Tiny qualifier under the KPI, e.g. "מיעד השבוע". */
  kpiHint?: string;
  /** 0..100 — optional slim progress rail shown collapsed and expanded. */
  progress?: number | null;
  accent?: HomeAccent;
  icon: ReactNode;
  children: ReactNode;
}

export function HomeCard({
  id,
  title,
  kpi,
  kpiHint,
  progress,
  accent = "neutral",
  icon,
  children,
}: HomeCardProps) {
  const ctx = useContext(Ctx);
  const open = ctx?.openId === id;

  return (
    <div className="glass-tile overflow-hidden">
      <button
        type="button"
        onClick={() => ctx?.toggle(id)}
        aria-expanded={open}
        className="flex w-full items-center gap-3.5 p-4 text-start transition-colors duration-300"
      >
        <span
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
            ACCENT_ICON[accent],
          )}
        >
          {icon}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold leading-tight">{title}</span>
          {kpiHint && (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {kpiHint}
            </span>
          )}
        </span>

        <span
          className={cn(
            "shrink-0 text-[17px] font-bold tabular-nums leading-none",
            ACCENT_KPI[accent],
          )}
        >
          {kpi}
        </span>

        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300",
            open && "rotate-180",
          )}
        />
      </button>

      {typeof progress === "number" && (
        <div className="mx-4 -mt-1 mb-3 h-1 overflow-hidden rounded-full bg-white/6">
          <div
            className={cn("h-full rounded-full transition-all duration-700", ACCENT_BAR[accent])}
            style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
          />
        </div>
      )}

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-white/6 px-4 pb-4 pt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Small labelled stat used inside expanded card bodies. */
export function HomeStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white/4 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-[16px] font-bold tabular-nums leading-none">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
