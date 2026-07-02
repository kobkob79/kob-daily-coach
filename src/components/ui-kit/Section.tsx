import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, subtitle, action, className }: SectionHeaderProps) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

interface PremiumCardProps {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
  interactive?: boolean;
}

export function PremiumCard({ children, className, as: As = "div", interactive }: PremiumCardProps) {
  return (
    <As
      className={cn(
        "rounded-3xl border border-border/60 bg-card/70 p-5 shadow-soft backdrop-blur-xl",
        "transition-all duration-300",
        interactive && "hover:border-primary/40 hover:shadow-glow active:scale-[0.99]",
        className,
      )}
    >
      {children}
    </As>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      {icon && (
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted/50 text-muted-foreground">
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
