/**
 * Media library — browses the official production assets in Storage.
 * Character and category come from the registry, so new folders need no code.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Images } from "lucide-react";
import { MediaGallery } from "@/components/media/MediaGallery";
import { SectionHeader } from "@/components/ui-kit/Section";
import { cn } from "@/lib/utils";
import {
  ASSETS_BUCKET,
  CATEGORY_LABELS,
  CHARACTERS,
  CHARACTER_LABELS,
  MEDIA_CATEGORIES,
  isCharacter,
  isMediaCategory,
  mediaPrefix,
  type CharacterKey,
  type MediaCategory,
} from "@/lib/media-paths";

export const Route = createFileRoute("/_authenticated/media")({
  validateSearch: (search: Record<string, unknown>) => ({
    character: (isCharacter(search.character as string)
      ? (search.character as CharacterKey)
      : "shiran") as CharacterKey,
    category: (isMediaCategory(search.category as string)
      ? (search.category as MediaCategory)
      : "identity") as MediaCategory,
  }),
  head: () => ({
    meta: [
      { title: "ספריית הנכסים | Viora" },
      {
        name: "description",
        content: "כל נכסי ההפקה הרשמיים של Viora — תמונות זהות, שיווק, תרגילים ווידאו.",
      },
      { property: "og:title", content: "ספריית הנכסים | Viora" },
      {
        property: "og:description",
        content: "ספריית מדיה חכמה שנטענת ישירות מהאחסון של Viora.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MediaPage,
});

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
        active
          ? "border-primary/60 bg-primary/15 text-primary shadow-glow"
          : "border-border/60 bg-card/60 text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

function MediaPage() {
  const { character, category } = Route.useSearch() as {
    character: CharacterKey;
    category: MediaCategory;
  };
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <div className="space-y-5 px-4 pt-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Link
          to="/dashboard"
          aria-label="חזרה"
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-card/60"
        >
          <ChevronLeft className="h-5 w-5 rotate-180" />
        </Link>
        <SectionHeader
          className="mb-0 flex-1"
          title="ספריית הנכסים"
          subtitle="נטען אוטומטית מהאחסון — בלי שמות קבצים קבועים"
        />
        <Images className="h-5 w-5 text-primary" />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {CHARACTERS.map((c) => (
          <Chip
            key={c}
            active={c === character}
            label={CHARACTER_LABELS[c]}
            onClick={() => navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, character: c }) })}
          />
        ))}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {MEDIA_CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            active={cat === category}
            label={CATEGORY_LABELS[cat]}
            onClick={() => navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, category: cat }) })}
          />
        ))}
      </div>

      <MediaGallery
        bucket={ASSETS_BUCKET}
        prefix={mediaPrefix(character, category)}
        title={`${CHARACTER_LABELS[character]} · ${CATEGORY_LABELS[category]}`}
      />
    </div>
  );
}
