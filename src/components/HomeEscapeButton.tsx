/**
 * VIORA NAV-001 — Global Home Escape.
 *
 * A single, reusable "always works" way home: never depends on browser
 * history (no history.back()), always targets the real home route, and —
 * on screens where leaving mid-flow could interrupt an active workout or
 * discard unsaved feedback — confirms before navigating away, with copy
 * that matches what's actually at risk on that screen (see
 * HomeEscapeConfirmKind in src/lib/home-escape.ts). Rendered only where
 * AppShell decides the bottom nav's own home tab isn't already visible.
 */
import { Home } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { HOME_ROUTE, type HomeEscapeConfirmKind } from "@/lib/home-escape";

export interface HomeEscapeButtonProps {
  /**
   * What leaving this screen could interrupt, if anything — decides
   * whether a confirm dialog shows before navigating home, and what it
   * says. `null`/omitted navigates straight home, no prompt.
   */
  confirmKind?: HomeEscapeConfirmKind;
  /**
   * Caller controls `display` — a plain "inline-flex", or a "hidden" plus
   * a viewport-conditional Tailwind variant for conditional placements —
   * so this component never fights a parent's layout. Deliberately not
   * spelled out as a literal class string here: Tailwind's content
   * scanner reads raw file text, comments included, so an example
   * bracket-variant class written in prose gets treated as a real
   * candidate and can break the CSS build.
   */
  className?: string;
}

const DIALOG_COPY: Record<
  Exclude<HomeEscapeConfirmKind, null>,
  { title: string; description: string; confirmLabel: string }
> = {
  active_workout: {
    title: "לצאת לעמוד הבית?",
    description: "האימון נשאר פעיל ברקע. אפשר לחזור אליו בכל רגע מהפס העליון.",
    confirmLabel: "יציאה לעמוד הבית",
  },
  unsaved_summary: {
    title: "לצאת בלי לשמור את האימון?",
    description: "המשוב שהוזן כאן (קושי, אנרגיה, כאב, הערות) עדיין לא נשמר. יציאה עכשיו תמחק אותו.",
    confirmLabel: "יציאה ללא שמירה",
  },
};

export function HomeEscapeButton({ confirmKind = null, className }: HomeEscapeButtonProps) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const goHome = () => {
    setConfirmOpen(false);
    navigate({ to: HOME_ROUTE });
  };

  const handleClick = () => {
    if (confirmKind) {
      setConfirmOpen(true);
      return;
    }
    goHome();
  };

  const copy = confirmKind ? DIALOG_COPY[confirmKind] : null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="חזרה לעמוד הבית"
        className={cn(
          "h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-card/60 text-foreground/80 backdrop-blur-xl transition hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95",
          className,
        )}
      >
        <Home className="mx-auto h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden />
      </button>

      {copy && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>{copy.title}</AlertDialogTitle>
              <AlertDialogDescription>{copy.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
              <AlertDialogCancel>ביטול</AlertDialogCancel>
              <AlertDialogAction onClick={goHome}>{copy.confirmLabel}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
