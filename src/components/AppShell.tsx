import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Bell, User, LogOut, Settings, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { liveModules } from "@/lib/modules";
import { t } from "@/lib/i18n";
import { VioraLogo } from "@/components/brand/VioraLogo";
import { AskVioraSheet } from "@/components/AskVioraSheet";
import { ActiveWorkoutBar } from "@/components/ActiveWorkoutBar";
import { fetchIsAdmin } from "@/lib/admin";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  const qc = useQueryClient();
  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: fetchIsAdmin });
  const [askOpen, setAskOpen] = useState(false);
  const hideBottomNav = pathname.startsWith("/workouts/session/");
  const isAdvisorChat = /^\/coach\/[^/]+\/?$/.test(pathname);

  // The bottom nav is fixed, so its real height (which changes when the
  // active-workout strip appears, and with the device safe-area inset) must
  // become bottom padding on <main>. A hardcoded pb-32 guessed wrong and let
  // content scroll underneath the bar.
  const navRef = useRef<HTMLElement | null>(null);
  const [navHeight, setNavHeight] = useState(0);

  useEffect(() => {
    if (hideBottomNav) {
      setNavHeight(0);
      return;
    }
    const el = navRef.current;
    if (!el) return;
    const measure = () => setNavHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [hideBottomNav, pathname]);

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
    <div
      className={cn(
        "relative flex flex-col overflow-x-hidden bg-background text-foreground",
        isAdvisorChat ? "h-[100dvh] overflow-y-hidden" : "min-h-[100dvh]",
      )}
    >
      {/* Cinematic background — soft indigo + lime auras */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <div className="absolute -top-32 -left-24 h-[420px] w-[420px] rounded-full bg-[oklch(0.68_0.18_275/0.22)] blur-[120px]" />
        <div className="absolute top-1/3 -right-24 h-[360px] w-[360px] rounded-full bg-[oklch(0.93_0.24_125/0.14)] blur-[110px] animate-soft-pulse" />
        <div className="absolute bottom-0 left-1/4 h-[320px] w-[320px] rounded-full bg-[oklch(0.68_0.18_275/0.18)] blur-[100px]" />
      </div>

      {/* In advisor chat the viewport height is the whole layout budget. On short
          viewports (landscape phones) the app header + bottom nav ate the entire
          message area, so both collapse there and the chat keeps its own back
          button and composer. */}
      <header
        className={cn(
          "sticky top-0 z-40 shrink-0 border-b border-white/5 bg-background/50 backdrop-blur-2xl",
          isAdvisorChat && "[@media(max-height:560px)]:hidden",
        )}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-1.5">
            <Link
              to="/profile"
              aria-label={t("profile.title")}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-card/60 backdrop-blur-xl transition hover:border-primary/40"
            >
              <User className="h-[18px] w-[18px] text-foreground/80" strokeWidth={1.8} />
            </Link>
            {adminQ.data === true && (
              <Link
                to="/admin"
                aria-label="ניהול Viora"
                className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-card/60 backdrop-blur-xl transition hover:border-primary/40"
              >
                <Settings className="h-[18px] w-[18px] text-foreground/80" strokeWidth={1.8} />
              </Link>
            )}
          </div>

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

      <main
        className={cn(
          "relative z-10 mx-auto w-full max-w-2xl flex-1 px-4",
          isAdvisorChat
            ? "min-h-0 overflow-hidden pt-2 pb-[var(--viora-nav-pad)] [@media(max-height:560px)]:pt-1 [@media(max-height:560px)]:pb-2"
            : "pt-4",
        )}
        style={
          isAdvisorChat
            ? ({
                "--viora-nav-pad": `${hideBottomNav ? 16 : navHeight + 16}px`,
              } as CSSProperties)
            : { paddingBottom: hideBottomNav ? 16 : navHeight + 16 }
        }
      >
        {children}
      </main>

      {!hideBottomNav && (
        <nav
          ref={navRef}
          className={cn(
            "fixed inset-x-0 bottom-0 z-40",
            isAdvisorChat && "[@media(max-height:560px)]:hidden",
          )}
          aria-label="Primary"
        >
          {/* Active workout strip floats above the flat bar */}
          <div className="mx-auto max-w-2xl px-3 pb-2">
            <ActiveWorkoutBar />
          </div>

          <div className="border-t border-border bg-card/85 backdrop-blur-2xl shadow-soft pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto flex h-[60px] max-w-2xl items-stretch">
              {leftNav.map((item) => (
                <NavTab key={item.id} item={item} pathname={pathname} />
              ))}

              <div className="flex shrink-0 items-center justify-center px-1">
                <button
                  onClick={() => router.navigate({ to: "/coach" })}
                  aria-label="פתח את יועצי Viora"
                  className="group relative grid h-12 w-12 place-items-center"
                >
                  <span
                    className="absolute inset-0 rounded-full bg-primary/50 animate-breathe"
                    aria-hidden
                  />
                  <span className="relative grid h-12 w-12 place-items-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-[0_10px_32px_-8px_oklch(0.86_0.22_130/0.55)] transition group-active:scale-95">
                    <Sparkles className="h-5 w-5" strokeWidth={2.2} />
                  </span>
                </button>
              </div>

              {rightNav.map((item) => (
                <NavTab key={item.id} item={item} pathname={pathname} />
              ))}
            </div>
          </div>
        </nav>
      )}

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
        "group relative flex flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {active && (
        <span
          className="absolute inset-x-3 top-0 h-[2px] rounded-full bg-primary shadow-[0_0_12px_0_oklch(0.93_0.24_125/0.7)]"
          aria-hidden
        />
      )}
      <Icon
        className={cn(
          "h-[20px] w-[20px] transition",
          active && "drop-shadow-[0_0_8px_currentColor]",
        )}
        strokeWidth={active ? 2.2 : 1.7}
      />
      <span className="leading-none tracking-tight">{t(item.labelKey)}</span>
    </Link>
  );
}
