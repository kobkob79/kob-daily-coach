import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  Dumbbell,
  TrendingUp,
  Salad,
  Droplets,
  Moon,
  CalendarDays,
  Check,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { VioraLogo } from "@/components/brand/VioraLogo";
import { landingContent as c } from "@/lib/landing-content";

const icons: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  dumbbell: Dumbbell,
  "trending-up": TrendingUp,
  salad: Salad,
  droplets: Droplets,
  moon: Moon,
  "calendar-days": CalendarDays,
};

export function LandingPage() {
  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-background text-foreground">
      {/* Ambient gradient field */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <div className="absolute -top-40 right-[-15%] h-[520px] w-[520px] rounded-full bg-[oklch(0.93_0.24_125/0.16)] blur-[130px] animate-soft-pulse" />
        <div className="absolute top-1/4 left-[-20%] h-[460px] w-[460px] rounded-full bg-[oklch(0.68_0.18_275/0.24)] blur-[130px]" />
        <div className="absolute bottom-[-10%] left-1/3 h-[420px] w-[420px] rounded-full bg-[oklch(0.68_0.18_275/0.16)] blur-[120px]" />
      </div>

      <main className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-16">
        {/* HERO */}
        <section className="flex min-h-[100dvh] flex-col justify-center py-16">
          <div className="animate-stagger" style={{ animationDelay: "40ms" }}>
            <VioraLogo className="h-20 w-20 rounded-[28px] ring-glow" />
          </div>

          <p
            className="animate-stagger mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
            style={{ animationDelay: "120ms" }}
          >
            {c.eyebrow}
          </p>

          <h1
            className="animate-stagger mt-3 font-display text-[38px] font-bold leading-[1.1] tracking-tight sm:text-[46px]"
            style={{ animationDelay: "180ms" }}
          >
            <span className="gradient-text">{c.headline}</span>
          </h1>

          <p
            className="animate-stagger mt-5 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground"
            style={{ animationDelay: "260ms" }}
          >
            {c.subheadline}
          </p>

          <div className="animate-stagger mt-10 flex flex-col gap-3" style={{ animationDelay: "340ms" }}>
            <Link
              to="/auth"
              className="group flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98]"
            >
              {c.cta.primary}
              <ArrowLeft className="h-[18px] w-[18px] transition-transform group-hover:-translate-x-0.5" strokeWidth={2.2} />
            </Link>
            <Link
              to="/auth"
              className="flex h-14 items-center justify-center rounded-full border border-white/12 bg-card/60 text-[15px] font-medium backdrop-blur-xl transition hover:border-primary/40 active:scale-[0.98]"
            >
              {c.cta.secondary}
            </Link>
          </div>
        </section>

        {/* FEATURE CAROUSEL */}
        <section className="py-6">
          <h2 className="mb-4 font-display text-xl font-bold tracking-tight">{c.featuresTitle}</h2>
          <div
            className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ scrollBehavior: "smooth" }}
          >
            {c.features.map((f, i) => {
              const Icon = icons[f.icon] ?? Sparkles;
              return (
                <article
                  key={f.id}
                  className="glass-tile animate-stagger min-w-[196px] max-w-[196px] shrink-0 snap-start p-5"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/12 text-primary">
                    <Icon className="h-[20px] w-[20px]" strokeWidth={1.9} />
                  </span>
                  <h3 className="mt-4 text-[15px] font-semibold tracking-tight">{f.title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{f.line}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* TRUST */}
        <section className="py-8">
          <div className="glass-card p-6">
            <h2 className="font-display text-lg font-bold tracking-tight">{c.trustTitle}</h2>
            <ul className="mt-4 space-y-3">
              {c.trust.map((item) => (
                <li key={item} className="flex items-center gap-3 text-[14px]">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-[13px] w-[13px]" strokeWidth={3} />
                  </span>
                  <span className="text-foreground/90">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Reserved for future sprints: testimonials, success stories,
            community, premium. Intentionally not rendered yet. */}

        <section className="pt-4 pb-2 text-center">
          <Link
            to="/auth"
            className="inline-flex items-center justify-center rounded-full bg-primary px-10 py-4 text-[16px] font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98]"
          >
            {c.cta.primary}
          </Link>
          <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <VioraLogo badge={false} className="h-4 w-4 text-muted-foreground" />
            Viora
          </p>
        </section>
      </main>
    </div>
  );
}
