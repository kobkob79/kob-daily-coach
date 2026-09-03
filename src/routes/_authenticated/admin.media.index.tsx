import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Images } from "lucide-react";

import { PremiumCard } from "@/components/ui-kit/Section";
import { ADMIN_MEDIA_CATEGORIES } from "@/lib/admin-media-hub";

export const Route = createFileRoute("/_authenticated/admin/media/")({
  head: () => ({
    meta: [{ title: "ניהול מדיה · Viora" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: MediaHubPage,
});

function MediaHubPage() {
  return (
    <div className="space-y-5 pb-6" dir="rtl">
      <header className="flex items-center gap-3">
        <Link
          to="/admin"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
          aria-label="חזרה למרכז הניהול"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight">ניהול מדיה</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            העלאה, ארגון וניהול המדיה של Viora
          </p>
        </div>
        <Images className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      </header>

      <nav className="space-y-2.5" aria-label="קטגוריות מדיה">
        {ADMIN_MEDIA_CATEGORIES.map((category) => (
          <Link key={category.id} to={category.to} className="block">
            <PremiumCard className="border-border/70 bg-card/85 p-3.5 shadow-sm transition hover:border-primary/40 active:scale-[0.99]">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Images className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[13px] font-bold">{category.title}</h2>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{category.description}</p>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
            </PremiumCard>
          </Link>
        ))}
      </nav>
    </div>
  );
}
