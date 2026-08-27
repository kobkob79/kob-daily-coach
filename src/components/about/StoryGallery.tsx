import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type { PublishedAboutMedia } from "@/lib/about-media";
import { cn } from "@/lib/utils";

export function StoryGallery({
  items,
  personName,
}: {
  items: readonly PublishedAboutMedia[];
  personName: string;
}) {
  const [active, setActive] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!viewerOpen) return;
    history.pushState({ vioraStoryViewer: true }, "");
    const onPopState = () => setViewerOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") history.back();
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [viewerOpen]);

  if (items.length === 0) return null;
  const closeViewer = () => history.back();
  const moveViewer = (direction: -1 | 1) =>
    setActive((current) => (current + direction + items.length) % items.length);

  return (
    <section aria-labelledby="story-gallery-title" className="py-2">
      <p className="text-xs font-semibold tracking-[0.16em] text-primary">STORY GALLERY</p>
      <h2 id="story-gallery-title" className="mt-2 text-2xl font-black sm:text-3xl">
        רגעים מהדרך
      </h2>

      <div className="mt-7 sm:hidden">
        <div
          ref={carouselRef}
          className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={(event) => {
            const node = event.currentTarget;
            const cards = Array.from(node.children) as HTMLElement[];
            const viewportCenter = node.getBoundingClientRect().left + node.clientWidth / 2;
            const nearest = cards.reduce(
              (best, card, index) =>
                Math.abs(
                  card.getBoundingClientRect().left + card.offsetWidth / 2 - viewportCenter,
                ) <
                Math.abs(
                  cards[best].getBoundingClientRect().left +
                    cards[best].offsetWidth / 2 -
                    viewportCenter,
                )
                  ? index
                  : best,
              0,
            );
            setActive(nearest);
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="w-[86%] shrink-0 snap-center overflow-hidden rounded-3xl border border-border/60 bg-card text-right shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => {
                setActive(index);
                setViewerOpen(true);
              }}
              aria-label={`פתיחת תמונה ${index + 1} מתוך ${items.length}`}
            >
              <GalleryImage item={item} personName={personName} className="aspect-[4/3]" />
              {item.caption && (
                <span className="block min-h-12 px-4 py-3 text-xs leading-5 text-muted-foreground">
                  {item.caption}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">
            {active + 1} מתוך {items.length}
          </span>
          <div className="flex gap-1.5" aria-hidden="true">
            {items.map((item, index) => (
              <span
                key={item.id}
                className={cn(
                  "h-1.5 rounded-full transition-[width] motion-reduce:transition-none",
                  index === active ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 hidden grid-cols-12 gap-4 sm:grid">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setActive(index);
              setViewerOpen(true);
            }}
            className={cn(
              "overflow-hidden rounded-3xl border border-border/60 bg-card text-right shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              index % 3 === 0 ? "col-span-7" : "col-span-5",
            )}
          >
            <GalleryImage item={item} personName={personName} className="aspect-[4/3]" />
            {item.caption && (
              <span className="block px-4 py-3 text-xs text-muted-foreground">{item.caption}</span>
            )}
          </button>
        ))}
      </div>

      {viewerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`גלריית ${personName}`}
          className="fixed inset-0 z-[100] flex flex-col bg-black/95 text-white"
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            if (touchStartX.current == null || items.length < 2) return;
            const delta =
              (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
            if (Math.abs(delta) > 45) moveViewer(delta > 0 ? -1 : 1);
            touchStartX.current = null;
          }}
        >
          <div className="flex items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)]">
            <button
              ref={closeRef}
              type="button"
              onClick={closeViewer}
              aria-label="סגירת הגלריה"
              className="grid h-11 w-11 place-items-center rounded-full bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
            >
              <X />
            </button>
            <span className="text-sm font-semibold">
              {active + 1} מתוך {items.length}
            </span>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
            <img
              src={items[active].signedUrl}
              alt={items[active].alt_text || `${personName}, רגע מהדרך`}
              className="max-h-full max-w-full object-contain"
            />
            {items.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="התמונה הקודמת"
                  onClick={() => moveViewer(-1)}
                  className="absolute right-3 grid h-11 w-11 place-items-center rounded-full bg-black/55 focus-visible:ring-2 focus-visible:ring-white"
                >
                  <ChevronRight />
                </button>
                <button
                  type="button"
                  aria-label="התמונה הבאה"
                  onClick={() => moveViewer(1)}
                  className="absolute left-3 grid h-11 w-11 place-items-center rounded-full bg-black/55 focus-visible:ring-2 focus-visible:ring-white"
                >
                  <ChevronLeft />
                </button>
              </>
            )}
          </div>
          <p className="min-h-16 px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 text-center text-sm text-white/75">
            {items[active].caption}
          </p>
        </div>
      )}
    </section>
  );
}

function GalleryImage({
  item,
  personName,
  className,
}: {
  item: PublishedAboutMedia;
  personName: string;
  className?: string;
}) {
  return (
    <span className={cn("relative block overflow-hidden bg-muted", className)}>
      <img
        src={item.signedUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-xl"
      />
      <img
        src={item.signedUrl}
        alt={item.alt_text || `${personName}, רגע מהדרך`}
        loading="lazy"
        className="relative h-full w-full object-contain"
      />
    </span>
  );
}
