import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { CoachAdvisor } from "@/lib/coach-advisors";
import { AdvisorVisual } from "./AdvisorVisual";

export function AdvisorCard({ advisor }: { advisor: CoachAdvisor }) {
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border/60 bg-card/70 shadow-soft">
      <div className="p-2 pb-0">
        <AdvisorVisual advisor={advisor} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-lg font-extrabold">{advisor.name}</p>
        <p className="mt-0.5 text-xs font-semibold text-primary">{advisor.field}</p>
        <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
          {advisor.tagline}
        </p>
        <Link
          to="/coach/$advisorId"
          params={{ advisorId: advisor.id }}
          className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 text-sm font-bold text-foreground transition active:scale-[0.98] active:bg-primary/20"
        >
          פתיחת היועץ
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
