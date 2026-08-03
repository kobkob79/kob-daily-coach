/**
 * CharacterAsset — renders ONE asset of a character in any screen.
 *
 * Generic by design: pass a characterId + assetCategory (+ optional file name
 * or index) and it resolves the object from Storage, with skeleton / empty /
 * error fallbacks. No filename is ever hardcoded in consuming screens.
 */
import { ImageOff } from "lucide-react";
import { useCharacterAssets } from "@/hooks/useCharacterAssets";
import { cn } from "@/lib/utils";
import type { AssetCategory, CharacterId } from "@/lib/media-paths";
import type { MediaItem } from "@/services/media.service";

export interface CharacterAssetProps {
  characterId: CharacterId;
  category: AssetCategory;
  /** Case-insensitive filename match (falls back to `index` when absent). */
  name?: string;
  /** Which item to render when no name is given. Default 0. */
  index?: number;
  alt?: string;
  className?: string;
  /** Rendered while loading. Defaults to a pulse block. */
  fallback?: React.ReactNode;
  /** Rendered when nothing matches or the fetch failed. */
  emptyFallback?: React.ReactNode;
  /** Video playback flags (ignored for images). */
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
}

export function CharacterAsset({
  characterId,
  category,
  name,
  index = 0,
  alt,
  className,
  fallback,
  emptyFallback,
  controls = false,
  autoPlay = false,
  loop = false,
  muted = true,
}: CharacterAssetProps) {
  const query = useCharacterAssets({ characterId, category, search: name });
  const items = query.items;
  const item: MediaItem | undefined = name
    ? (items.find((i) => i.name.toLowerCase() === name.toLowerCase()) ?? items[0])
    : items[index];

  if (query.isPending) {
    return (
      fallback ?? (
        <div
          className={cn(
            "animate-pulse rounded-2xl border border-border/40 bg-muted/40",
            className,
          )}
        />
      )
    );
  }

  if (query.isError || !item) {
    return (
      emptyFallback ?? (
        <div
          className={cn(
            "grid place-items-center rounded-2xl border border-border/40 bg-muted/25 text-muted-foreground",
            className,
          )}
          aria-hidden
        >
          <ImageOff className="h-5 w-5" />
        </div>
      )
    );
  }

  if (item.kind === "video") {
    return (
      <video
        src={item.url}
        className={className}
        controls={controls}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <img
      src={item.url}
      alt={alt ?? item.name}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}
