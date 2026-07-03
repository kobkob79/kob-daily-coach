import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { LogOut, Camera } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { liveModules } from "@/lib/modules";
import { t } from "@/lib/i18n";
import { QuickAddButton } from "@/components/ui-kit/QuickAddSheet";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const qc = useQueryClient();

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  const nav = liveModules().filter((m) => m.route);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 hero-glow opacity-70" aria-hidden />

      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3.5">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div
              className="h-9 w-9 rounded-2xl ring-glow"
              style={{ background: "var(--gradient-primary)" }}
              aria-hidden
            />
            <span className="font-display text-lg font-bold tracking-tight">
              Kobi<span className="gradient-text">OS</span>
            </span>
          </Link>
          <button
            onClick={handleSignOut}
            className="rounded-full p-2.5 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
            aria-label={t("action.signOut")}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-2xl flex-1 px-4 pb-32 pt-4">{children}</main>

      <QuickAddButton />

      <nav
        className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <div className="mx-auto max-w-2xl px-3 pb-2">
          <div className="flex items-center justify-around rounded-3xl border border-border/60 bg-card/85 px-2 py-1.5 shadow-soft backdrop-blur-2xl">
            {nav.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.route ||
                (item.route !== "/dashboard" && item.route && pathname.startsWith(item.route));
              return (
                <Link
                  key={item.id}
                  to={item.route!}
                  className={cn(
                    "group relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-2 text-[10px] font-medium transition",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-xl transition",
                      active && "bg-primary/12",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-[18px] w-[18px] transition",
                        active && "drop-shadow-[0_0_10px_currentColor]",
                      )}
                      strokeWidth={active ? 2.4 : 2}
                    />
                  </span>
                  <span className="leading-none">{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
