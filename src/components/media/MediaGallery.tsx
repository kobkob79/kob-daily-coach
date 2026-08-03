/**
 * Reusable media gallery — character + category (or raw bucket + prefix) in,
 * paginated grid out.
 *
 * Deliberately generic: identity images, marketing assets, exercise assets
 * and future videos all render through this one component, for any character.
 */
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ImageOff, AlertTriangle, RefreshCw, X, Play } from "lucide-react";
import { listMedia, MEDIA_PAGE_SIZE, SIGNED_URL_TTL, type MediaItem } from "@/services/media.service";
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
} & (
  | { characterId: CharacterId; category: AssetCategory; bucket?: string; prefix?: never }
  | { bucket: string; prefix: string; characterId?: never; category?: never }
);

export function MediaGallery(props: MediaGalleryProps) {
  const { title, className, columns = 2 } = props;
  const bucket = props.bucket ?? ASSETS_BUCKET;
  const prefix =
    props.prefix ?? characterAssetPrefix(props.characterId!, props.category!);
  const [preview, setPreview] = useState<MediaItem | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["media", bucket, prefix],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      listMedia({ bucket, prefix, limit: MEDIA_PAGE_SIZE, offset: pageParam as number }),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    // Keep pages usable well within the signed-URL lifetime.
    staleTime: (SIGNED_URL_TTL - 300) * 1000,
    gcTime: SIGNED_URL_TTL * 1000,
    retry: 1,
  });


  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

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
      {title && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="text-xs text-muted-foreground">{items.length} קבצים</span>
        </div>
      )}

      <div className={cn("grid gap-3", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {items.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => setPreview(item)}
            className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-border/50 bg-muted/30 text-start transition-all active:scale-[0.98]"
          >
            {item.kind === "video" ? (
              <>
                <video
                  src={item.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 grid place-items-center bg-background/30">
                  <Play className="h-6 w-6" />
                </span>
              </>
            ) : item.kind === "image" ? (
              <img
                src={item.url}
                alt={item.name}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            ) : (
              <span className="grid h-full w-full place-items-center px-2 text-center text-[11px] text-muted-foreground">
                {item.name}
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-background/90 to-transparent px-2 pb-1.5 pt-4 text-[11px] text-muted-foreground">
              {item.name}
            </span>
          </button>
        ))}
      </div>

      {query.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "טוען…" : "טען עוד"}
          </Button>
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-4 backdrop-blur-xl"
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            aria-label="סגור"
            className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-border/60 bg-card/80"
            onClick={() => setPreview(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {preview.kind === "video" ? (
            <video src={preview.url} controls autoPlay playsInline className="max-h-[80vh] w-full rounded-2xl" />
          ) : (
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-[80vh] w-auto rounded-2xl object-contain"
            />
          )}
          <p className="absolute bottom-6 inset-x-0 truncate px-6 text-center text-xs text-muted-foreground">
            {preview.name}
          </p>
        </div>
      )}
    </PremiumCard>
  );
}
