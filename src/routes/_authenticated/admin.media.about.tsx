import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Users } from "lucide-react";

import { AboutMediaManager } from "@/components/admin/AboutMediaManager";

export const Route = createFileRoute("/_authenticated/admin/media/about")({
  head: () => ({
    meta: [{ title: "מדיה · מי אנחנו · Viora" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AboutMediaPage,
});

function AboutMediaPage() {
  return (
    <div className="space-y-4 pb-6" dir="rtl">
      <header className="flex items-center gap-3">
        <Link
          to="/admin/media"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
          aria-label="חזרה לניהול מדיה"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight">מדיה · מי אנחנו</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            תמונות צוות וגלריות עמודי מי אנחנו
          </p>
        </div>
        <Users className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      </header>

      <AboutMediaManager />
    </div>
  );
}
