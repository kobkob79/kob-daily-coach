/**
 * Reusable media gallery — characterId + assetCategory (or a raw bucket +
 * prefix) in, grid + fullscreen viewer out.
 *
 * Fully generic: identity images, marketing assets, exercise assets and
 * videos, for any character, including nested folders. Nothing is hardcoded —
 * every file name, extension and folder is discovered from Storage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ImageOff,
  AlertTriangle,
  RefreshCw,
  X,
  Play,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Folder,
} from "lucide-react";
import {
  listMediaTree,
  SIGNED_URL_TTL,
  type MediaItem,
} from "@/services/media.service";
import { PremiumCard, EmptyState } from "@/components/ui-kit/Section";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ASSETS_BUCKET,
  characterAssetPrefix,
  type AssetCategory,
  type CharacterId,
} from "@/lib/media-paths";

type MediaGalleryProps = {
  title?: string;
  className?: string;
  /** Grid columns on mobile. */
  columns?: 2 | 3;
  onSelectItem?: (item: MediaItem) => void;
} & (
  | { characterId: CharacterId; category: AssetCategory; bucket?: string; prefix?: never }
  | { bucket: string; prefix: string; characterId?: never; category?: never }
);

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

export function MediaGallery(props: MediaGalleryProps) {
  const { title, className, columns = 2, onSelectItem } = props;
  const bucket = props.bucket ?? ASSETS_BUCKET;
  const prefix =
    props.prefix ?? characterAssetPrefix(props.characterId!, props.category!);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ["media-tree", bucket, prefix],
    queryFn: () => listMediaTree({ bucket, prefix }),
    staleTime: (SIGNED_URL_TTL - 300) * 1000,
    gcTime: SIGNED_URL_TTL * 1000,
    retry: 1,
  });

  const items = query.data ?? [];

  /** Files grouped by nested folder, preserving alphabetical order. */
  const groups = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    for (const item of items) {
      const list = map.get(item.folder);
      if (list) list.push(item);
      else map.set(item.folder, [item]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  if (query.isPending) {
    return (
      <PremiumCard className={className}>
        {title && <h3 className="mb-3 text-sm font-semibold">{title}</h3>}
        <div className={cn("grid gap-3", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] animate-pulse rounded-2xl border border-border/40 bg-muted/40"
            />
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">טוען נכסים…</p>
      </PremiumCard>
    );
  }

  if (query.isError) {
    return (
      <PremiumCard className={className}>
        <EmptyState
          icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
          title="לא הצלחנו לטעון את הנכסים"
          hint={query.error instanceof Error ? query.error.message : "שגיאה לא צפויה"}
          action={
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              <RefreshCw className="ml-1 h-4 w-4" />
              נסה שוב
            </Button>
          }
        />
      </PremiumCard>
    );
  }

  if (items.length === 0) {
    return (
      <PremiumCard className={className}>
        <EmptyState
          icon={<ImageOff className="h-5 w-5" />}
          title="עדיין אין נכסים בתיקייה הזאת"
          hint="ברגע שיעלו קבצים לתיקייה, הם יופיעו כאן אוטומטית."
          action={
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              <RefreshCw className="ml-1 h-4 w-4" />
              רענן
            </Button>
          }
        />
      </PremiumCard>
    );
  }

  return (
    <PremiumCard className={className}>
      <div className="mb-3 flex items-center justify-between gap-3">
        {title ? <h3 className="text-sm font-semibold">{title}</h3> : <span />}
        <span className="text-xs text-muted-foreground">{items.length} קבצים</span>
      </div>

      <div className="space-y-5">
        {groups.map(([folder, files]) => (
          <div key={folder || "__root"} className="space-y-2">
            {folder && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Folder className="h-3.5 w-3.5" />
                <span dir="ltr" className="truncate">{folder}</span>
              </p>
            )}
            <div className={cn("grid gap-3", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
              {files.map((item) => (
                <MediaThumb
                  key={item.path}
                  item={item}
  onOpen={() =>
  onSelectItem
    ? onSelectItem(item)
    : setActiveIndex(items.indexOf(item))
}                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {activeIndex !== null && items[activeIndex] && (
        <MediaViewer
          items={items}
          index={activeIndex}
          onIndexChange={setActiveIndex}
          onClose={() => setActiveIndex(null)}
        />
      )}
    </PremiumCard>
  );
}

/** One grid tile with its own loading skeleton and error placeholder. */
function MediaThumb({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  const [state, setState] = useState<"loading" | "ready" | "error">(
    item.kind === "image" || item.kind === "video" ? "loading" : "error",
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-border/50 bg-muted/30 text-start transition-all active:scale-[0.98]"
    >
      {state === "loading" && (
        <span className="absolute inset-0 animate-pulse bg-muted/50" aria-hidden />
      )}

      {item.kind === "video" ? (
        <>
          <video
            src={item.url}
            muted
            playsInline
            preload="metadata"
            onLoadedData={() => setState("ready")}
            onError={() => setState("error")}
            className="h-full w-full object-cover"
          />
          <span className="absolute inset-0 grid place-items-center bg-background/30">
            <Play className="h-6 w-6" />
          </span>
        </>
      ) : item.kind === "image" ? (
        state === "error" ? (
          <span className="grid h-full w-full place-items-center text-muted-foreground">
            <ImageOff className="h-5 w-5" />
          </span>
        ) : (
          <img
            src={item.url}
            alt={item.name}
            loading="lazy"
            decoding="async"
            onLoad={() => setState("ready")}
            onError={() => setState("error")}
            className={cn(
              "h-full w-full object-cover transition-all duration-300 group-hover:scale-[1.03]",
              state === "loading" && "opacity-0",
            )}
          />
        )
      ) : (
        <span className="grid h-full w-full place-items-center px-2 text-center text-[11px] text-muted-foreground">
          {item.name}
        </span>
      )}

      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background/90 to-transparent px-2 pb-1.5 pt-4 text-[11px] text-muted-foreground">
        {item.name}
      </span>
    </button>
  );
}

/** Fullscreen viewer: prev/next, wheel + pinch zoom, drag pan, path display. */
function MediaViewer({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: MediaItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setLoaded(false);
    setFailed(false);
  };

  const go = useCallback(
    (delta: number) => {
      const next = (index + delta + items.length) % items.length;
      onIndexChange(next);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    reset();
  }, [item?.path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // RTL layout: ArrowLeft advances visually to the next item.
      if (e.key === "ArrowLeft") go(1);
      if (e.key === "ArrowRight") go(-1);
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(MAX_ZOOM, z * 1.25));
      if (e.key === "-") setZoom((z) => Math.max(MIN_ZOOM, z / 1.25));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // Native non-passive wheel listener so preventDefault actually works.
  const zoomAt = useRef<(e: WheelEvent) => void>(() => {});
  zoomAt.current = (e: WheelEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left - rect.width / 2;
    const py = e.clientY - rect.top - rect.height / 2;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.exp(-dy * 0.0018)));
    const k = next / zoom;
    setZoom(next);
    setOffset((o) =>
      next === 1
        ? { x: 0, y: 0 }
        : { x: px - (px - o.x) * k, y: py - (py - o.y) * k },
    );
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt.current(e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const stepZoom = (factor: number) => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  };

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/97 backdrop-blur-xl" dir="rtl">
      {/* Top bar: path + close */}
      <div className="flex items-start gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <button
          type="button"
          aria-label="סגור"
          onClick={onClose}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border/60 bg-card/80"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold" dir="ltr">{item.name}</p>
          <p className="truncate text-[11px] text-muted-foreground" dir="ltr">
            {item.path}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-border/60 bg-card/70 px-2.5 py-1 text-[11px] text-muted-foreground">
          {index + 1}/{items.length}
        </span>
      </div>

      {/* Stage */}
      <div
        ref={containerRef}
        className="relative flex-1 touch-none select-none overflow-hidden"
        onPointerDown={(e) => {
          if (zoom === 1) return;
          drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onDoubleClick={() => (zoom === 1 ? stepZoom(2) : (setZoom(1), setOffset({ x: 0, y: 0 })))}
      >
        {!loaded && !failed && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="h-40 w-32 animate-pulse rounded-2xl bg-muted/50" />
          </div>
        )}

        {failed ? (
          <div className="absolute inset-0 grid place-items-center">
            <EmptyState
              icon={<ImageOff className="h-5 w-5" />}
              title="הקובץ לא נטען"
              hint={item.name}
            />
          </div>
        ) : (
          <div
            className="absolute inset-0 grid place-items-center"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              transition: drag.current ? "none" : "transform 120ms ease-out",
            }}
          >
            {item.kind === "video" ? (
              <video
                src={item.url}
                controls
                autoPlay
                playsInline
                onLoadedData={() => setLoaded(true)}
                onError={() => setFailed(true)}
                className="max-h-full max-w-full rounded-2xl"
              />
            ) : (
              <img
                src={item.url}
                alt={item.name}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
                draggable={false}
                className={cn(
                  "max-h-full max-w-full object-contain",
                  !loaded && "opacity-0",
                )}
              />
            )}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
        <Button variant="outline" size="icon" aria-label="הקודם" onClick={() => go(-1)}>
          <ChevronRight className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="התרחק"
            disabled={zoom <= MIN_ZOOM}
            onClick={() => stepZoom(1 / 1.4)}
          >
            <ZoomOut className="h-5 w-5" />
          </Button>
          <span className="w-12 text-center text-xs text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="התקרב"
            disabled={zoom >= MAX_ZOOM}
            onClick={() => stepZoom(1.4)}
          >
            <ZoomIn className="h-5 w-5" />
          </Button>
        </div>

        <Button variant="outline" size="icon" aria-label="הבא" onClick={() => go(1)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
