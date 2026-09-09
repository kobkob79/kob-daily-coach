/**
 * VIORA NAV-001 — Global Home Escape.
 *
 * A single, reusable "always works" way home: never depends on browser
 * history (no history.back()), always targets the real home route, and —
 * on screens where leaving mid-flow could interrupt an active workout —
 * confirms before navigating away. Rendered only where AppShell decides
 * the bottom nav's own home tab isn't already visible
 * (see src/lib/home-escape.ts).
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
import { HOME_ROUTE } from "@/lib/home-escape";

export interface HomeEscapeButtonProps {
  /** Show a leave-confirmation dialog before navigating home (active workout, unsaved flow, ...). */
  confirmBeforeLeave?: boolean;
  /**
   * Caller controls `display` (e.g. "inline-flex" vs a "hidden
   * [@media(...)]:inline-flex" pair for viewport-conditional placements)
   * so this component never fights a parent's layout.
   */
  className?: string;
}

export function HomeEscapeButton({ confirmBeforeLeave = false, className }: HomeEscapeButtonProps) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const goHome = () => {
    setConfirmOpen(false);
    navigate({ to: HOME_ROUTE });
  };

  const handleClick = () => {
    if (confirmBeforeLeave) {
      setConfirmOpen(true);
      return;
    }
    goHome();
  };

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

      {confirmBeforeLeave && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>לצאת לעמוד הבית?</AlertDialogTitle>
              <AlertDialogDescription>
                האימון נשאר פעיל ברקע וכל מה שכבר נשמר לא הולך לאיבוד. תוכל/י לחזור אליו בכל רגע
                מהפס העליון.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
              <AlertDialogCancel>ביטול</AlertDialogCancel>
              <AlertDialogAction onClick={goHome}>יציאה לעמוד הבית</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
