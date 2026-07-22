import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Bell, User, LogOut, Sparkles } from "lucide-react";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { liveModules } from "@/lib/modules";
import { t } from "@/lib/i18n";
import { VioraLogo } from "@/components/brand/VioraLogo";
import { AskVioraSheet } from "@/components/AskVioraSheet";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const qc = useQueryClient();
  const [askOpen, setAskOpen] = useState(false);
  const hideBottomNav = pathname.startsWith("/workouts/session/");

  const handleSignOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  const nav = liveModules().filter((m) => m.route);
  // Split the tabs so the AI button sits at the geometric center.
  const mid = Math.ceil(nav.length / 2);
  const leftNav = nav.slice(0, mid);
  const rightNav = nav.slice(mid);

  return (
    <div className="relative min-h-[100dvh] bg-background text-foreground flex flex-col overflow-hidden">
      {/* Cinematic background — soft indigo + lime auras */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <div className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-[oklch(0.68_0.18_275/0.22)] blur-[120px]" />
        <div className="absolute top-1/3 -right-24 h-[360px] w-[360px] rounded-full bg-[oklch(0.93_0.24_125/0.14)] blur-[110px] animate-soft-pulse" />
        <div className="absolute bottom-0 left-1/4 h-[320px] w-[320px] rounded-full bg-[oklch(0.68_0.18_275/0.18)] blur-[100px]" />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/50 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Link to="/profile" aria-label={t("profile.title")}
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-card/60 backdrop-blur-xl transition hover:border-primary/40">
            <User className="h-[18px] w-[18px] text-foreground/80" strokeWidth={1.8} />
          </Link>

          <Link to="/dashboard" className="flex items-center gap-2">
            <VioraLogo className="h-7 w-7 rounded-xl ring-glow" />
            <span className="font-display text-[17px] font-bold tracking-tight">
              <span className="gradient-text">Viora</span>
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            <button
              aria-label="Notifications"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-card/60 backdrop-blur-xl transition hover:border-primary/40"
            >
              <Bell className="h-[18px] w-[18px] text-foreground/80" strokeWidth={1.8} />
            </button>
            <button
              onClick={handleSignOut}
              aria-label={t("action.signOut")}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-card/60 backdrop-blur-xl transition hover:border-destructive/40"
            >
              <LogOut className="h-[18px] w-[18px] text-foreground/80" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-2xl flex-1 px-4 pb-32 pt-4">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        <div className="mx-auto max-w-2xl px-3 pb-3">
          <div className="relative flex items-center justify-around rounded-[28px] border border-white/8 bg-card/75 px-2 py-2 shadow-soft backdrop-blur-2xl">
            {leftNav.map((item) => (
              <NavTab key={item.id} item={item} pathname={pathname} />
            ))}

            {/* Center AI trigger */}
            <button
              onClick={() => setAskOpen(true)}
              aria-label="שאל את Viora"
              className="group relative -mt-8 grid h-16 w-16 shrink-0 place-items-center"
            >
              <span
                className="absolute inset-0 rounded-full bg-primary/50 animate-breathe"
                aria-hidden
              />
              <span className="relative grid h-16 w-16 place-items-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-[0_16px_48px_-10px_oklch(0.93_0.24_125/0.7)] transition group-active:scale-95">
                <Sparkles className="h-6 w-6" strokeWidth={2.2} />
              </span>
            </button>

            {rightNav.map((item) => (
              <NavTab key={item.id} item={item} pathname={pathname} />
            ))}
          </div>
        </div>
      </nav>

      <AskVioraSheet open={askOpen} onOpenChange={setAskOpen} pathname={pathname} />
    </div>
  );
}

function NavTab({
  item,
  pathname,
}: {
  item: ReturnType<typeof liveModules>[number];
  pathname: string;
}) {
  const Icon = item.icon;
  const active =
    pathname === item.route ||
    (item.route !== "/dashboard" && item.route && pathname.startsWith(item.route));
  return (
    <Link
      to={item.route!}
      className={cn(
        "group relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 place-items-center rounded-2xl transition",
          active && "bg-primary/12 shadow-[0_0_20px_-4px_oklch(0.93_0.24_125/0.5)]",
        )}
      >
        <Icon
          className={cn(
            "h-[18px] w-[18px] transition",
            active && "drop-shadow-[0_0_8px_currentColor]",
          )}
          strokeWidth={active ? 2.2 : 1.7}
        />
      </span>
      <span className="leading-none tracking-tight">{t(item.labelKey)}</span>
    </Link>
  );
}
