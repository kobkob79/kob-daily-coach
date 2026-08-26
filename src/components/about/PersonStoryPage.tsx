import { Link } from "@tanstack/react-router";
import { ArrowRight, Quote } from "lucide-react";

import { VioraLogo } from "@/components/brand/VioraLogo";
import type { AboutPerson } from "@/lib/about-people";

export function PersonStoryPage({ person }: { person: AboutPerson }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground" dir="rtl">
      <header className="absolute inset-x-0 top-0 z-20 mx-auto flex max-w-6xl items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <Link
          to="/about"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 bg-black/20 px-4 text-xs font-semibold text-white backdrop-blur-sm"
        >
          <ArrowRight className="h-4 w-4" /> חזרה ל־Viora
        </Link>
        <VioraLogo className="h-8 w-8 rounded-xl" />
      </header>

      <section className="relative isolate min-h-[34rem] overflow-hidden bg-[#101613] text-white sm:min-h-[42rem]">
        {person.image ? (
          <>
            <img
              src={person.image}
              alt={person.name}
              className="absolute inset-0 -z-20 h-full w-full object-cover"
              style={{ objectPosition: person.imagePosition }}
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/45 to-black/20" />
          </>
        ) : (
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/.3),transparent_36%),linear-gradient(145deg,#1b2a22,#0c1110_65%,#171915)]" />
        )}
        <div className="mx-auto flex min-h-[34rem] max-w-6xl items-end px-5 pb-12 pt-28 sm:min-h-[42rem] sm:pb-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.2em] text-primary">{person.eyebrow}</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">{person.name}</h1>
            <p className="mt-2 text-sm font-semibold text-white/75 sm:text-base">{person.role}</p>
            {person.age && <p className="mt-1 text-xs text-white/50">בן/בת {person.age}</p>}
            <p className="mt-6 max-w-xl text-base leading-7 text-white/78 sm:text-lg sm:leading-8">
              {person.lead}
            </p>
          </div>
        </div>
      </section>

      <article className="px-5 py-14 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-wrap gap-2">
            {person.themes.map((theme) => (
              <span
                key={theme}
                className="rounded-full border border-border/60 bg-muted/25 px-3 py-1.5 text-xs text-muted-foreground"
              >
                {theme}
              </span>
            ))}
          </div>
          <blockquote className="my-12 border-r-2 border-primary pr-5 text-xl font-semibold leading-9 sm:text-2xl sm:leading-10">
            „{person.quote}”
          </blockquote>
          <div className="space-y-14">
            {person.sections.map((section, index) => (
              <section key={section.title}>
                <p className="text-xs font-semibold tracking-[0.16em] text-primary">0{index + 1}</p>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">{section.title}</h2>
                <div className="mt-6 space-y-5 text-[15px] leading-8 text-muted-foreground sm:text-base sm:leading-9">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {section.quote && (
                  <blockquote className="mt-8 rounded-2xl bg-muted/35 p-5 text-base font-semibold leading-8">
                    <Quote className="mb-3 h-5 w-5 text-primary" />„{section.quote}”
                  </blockquote>
                )}
              </section>
            ))}
          </div>
        </div>
      </article>

      <footer className="border-t border-border/50 px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <VioraLogo className="h-7 w-7 rounded-lg" />
          <Link
            to="/about"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary"
          >
            <ArrowRight className="h-4 w-4" /> לכל הסיפורים
          </Link>
        </div>
      </footer>
    </main>
  );
}
