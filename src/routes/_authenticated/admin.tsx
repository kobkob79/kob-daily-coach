/**
 * "Viora Admin" — privileged content-management area.
 *
 * Phase 1 hosts the Media Inbox and the exercise-media assignment workflow,
 * which used to live inside the personal Profile screen.
 */
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ShieldAlert, Loader2 } from "lucide-react";

import { PremiumCard, SectionHeader, EmptyState } from "@/components/ui-kit/Section";
import { MediaInboxCard } from "@/components/media/MediaInboxCard";
import { fetchIsAdmin } from "@/lib/admin";
import { requireAdminAccessServer } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    try {
      await requireAdminAccessServer();
    } catch {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminPage,
});

function AdminPage() {
  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: fetchIsAdmin });

  return (
    <div className="space-y-6 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center gap-2">
        <Link
          to="/dashboard"
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 text-muted-foreground transition hover:text-foreground"
          aria-label="חזרה"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Viora Admin</h1>
          <p className="text-xs text-muted-foreground">ניהול תכנים ומדיה — לאדמינים בלבד</p>
        </div>
      </div>

      {adminQ.isPending && (
        <PremiumCard className="grid place-items-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </PremiumCard>
      )}

      {!adminQ.isPending && !adminQ.data && (
        <PremiumCard>
          <EmptyState
            icon={<ShieldAlert className="h-5 w-5 text-destructive" />}
            title="אין לך הרשאת אדמין"
            hint="האזור הזה מיועד לניהול תכנים בלבד."
          />
        </PremiumCard>
      )}

      {adminQ.data && (
        <>
          <SectionHeader title="ניהול מדיה" subtitle="העלאה, מחיקה ושיוך מדיה לתרגילים" />
          <MediaInboxCard />
        </>
      )}
    </div>
  );
}
