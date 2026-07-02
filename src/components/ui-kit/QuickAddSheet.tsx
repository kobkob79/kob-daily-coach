import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Dumbbell, Apple, HeartPulse, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Floating quick-add button + bottom action sheet. Purely presentational —
 * routes to existing log screens. Ready to be extended (e.g. inline forms,
 * voice capture, AI parse) without touching call sites.
 */
export function QuickAddButton() {
  const [open, setOpen] = useState(false);

  const items = [
    { to: "/workouts", label: t("action.logWorkout"), icon: Dumbbell },
    { to: "/nutrition", label: t("action.logMeal"), icon: Apple },
    { to: "/health", label: t("action.logHealth"), icon: HeartPulse },
  ] as const;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("home.quickAdd")}
        className={cn(
          "fixed bottom-24 z-50 grid h-14 w-14 place-items-center rounded-full",
          "text-primary-foreground shadow-glow transition-transform active:scale-95",
          "end-5", // logical end — respects RTL/LTR
        )}
        style={{ background: "var(--gradient-primary)" }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-t-3xl border-t border-border/60 bg-card p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-soft animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="mx-auto h-1 w-10 rounded-full bg-muted" />
              <button
                onClick={() => setOpen(false)}
                aria-label="close"
                className="absolute end-5 top-4 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <h3 className="mb-4 text-lg font-semibold">{t("home.quickAdd")}</h3>
            <div className="grid grid-cols-3 gap-3">
              {items.map((i) => {
                const Icon = i.icon;
                return (
                  <Link
                    key={i.to}
                    to={i.to}
                    onClick={() => setOpen(false)}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-muted/30 p-4 text-center transition hover:border-primary/40"
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "var(--gradient-primary)" }}>
                      <Icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <span className="text-xs font-medium">{i.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
