import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { ACCOUNT_DELETION_PAGE_STATUS } from "@/lib/account-deletion";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/account-deletion")({
  component: AccountDeletionPage,
});

function AccountDeletionPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-foreground" dir="rtl">
      <article className="mx-auto max-w-xl space-y-6 rounded-3xl border border-border/60 bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">מחיקת חשבון Viora</h1>
            <p className="text-sm text-muted-foreground">מידע על התהליך המתוכנן</p>
          </div>
        </div>

        <p className="leading-7">
          לאחר אימות מנגנון המחיקה בצד השרת, ניתן יהיה לבקש מחיקה מתוך אזור הפרופיל באפליקציה.
          התהליך יסיר את החשבון, הנתונים האישיים והקבצים השייכים לו.
        </p>
        <p className="rounded-2xl bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">
          מנגנון המחיקה עדיין אינו מסומן כפעיל בסביבת הייצור. אין בדף זה הבטחה שהבקשה זמינה כעת.
        </p>
        <p className="sr-only" data-account-deletion-status={ACCOUNT_DELETION_PAGE_STATUS}>
          {ACCOUNT_DELETION_PAGE_STATUS}
        </p>

        <Button asChild className="w-full sm:w-auto">
          <Link to="/profile">מעבר לפרופיל</Link>
        </Button>
      </article>
    </main>
  );
}
