/**
 * Hidden internal QA/Developer asset preview (/dev/assets).
 *
 * Not part of the app navigation — reachable only from the QA tools card.
 * In production these assets are consumed by individual screens through
 * `useCharacterAssets` / `<CharacterAsset />`, not from a gallery page.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Images } from "lucide-react";
import { MediaGallery } from "@/components/media/MediaGallery";
import { SectionHeader } from "@/components/ui-kit/Section";
import { cn } from "@/lib/utils";
import {
  ASSET_CATEGORIES,
  CATEGORY_LABELS,
  CHARACTER_IDS,
  CHARACTER_LABELS,
  POPULATED_CHARACTERS,
  isAssetCategory,
  isCharacterId,
  type AssetCategory,
  type CharacterId,
} from "@/lib/media-paths";

export const Route = createFileRoute("/_authenticated/dev/assets")({
  validateSearch: (search: Record<string, unknown>) => ({
    character: (isCharacterId(search.character as string)
      ? (search.character as CharacterId)
      : "shiran") as CharacterId,
    category: (isAssetCategory(search.category as string)
      ? (search.category as AssetCategory)
      : "identity") as AssetCategory,
  }),
  head: () => ({
    meta: [
      { title: "תצוגת נכסים (QA) | Viora" },
      {
        name: "description",
        content: "עמוד פיתוח פנימי לתצוגה מקדימה של נכסי דמויות מהאחסון.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "תצוגת נכסים (QA) | Viora" },
      {
        property: "og:description",
        content: "עמוד פיתוח פנימי לתצוגה מקדימה של נכסי דמויות.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DevAssetsPage,
});

function Chip({
  active,
  label,
  muted,
  onClick,
}: {
  active: boolean;
  label: string;
  muted?: boolean;
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
          : muted
            ? "border-border/40 bg-card/40 text-muted-foreground/60"
            : "border-border/60 bg-card/60 text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

function DevAssetsPage() {
  const { character, category } = Route.useSearch() as {
    character: CharacterId;
    category: AssetCategory;
  };
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <div className="space-y-5 px-4 pt-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Link
          to="/profile"
          aria-label="חזרה"
          className="grid h-9 w-9 place-items-center rounded-full border border-border/60 bg-card/60"
        >
          <ChevronLeft className="h-5 w-5 rotate-180" />
        </Link>
        <SectionHeader
          className="mb-0 flex-1"
          title="תצוגת נכסים · QA"
          subtitle="עמוד פנימי בלבד — נטען אוטומטית מהאחסון"
        />
        <Images className="h-5 w-5 text-primary" />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {CHARACTER_IDS.map((c) => (
          <Chip
            key={c}
            active={c === character}
            muted={!POPULATED_CHARACTERS.includes(c)}
            label={CHARACTER_LABELS[c]}
            onClick={() =>
              navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, character: c }) })
            }
          />
        ))}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {ASSET_CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            active={cat === category}
            label={CATEGORY_LABELS[cat]}
            onClick={() =>
              navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, category: cat }) })
            }
          />
        ))}
      </div>

      <MediaGallery
        characterId={character}
        category={category}
        title={`${CHARACTER_LABELS[character]} · ${CATEGORY_LABELS[category]}`}
      />

      <p className="pb-6 text-center text-[11px] text-muted-foreground">
        {`characters/${character}/${category}`}
      </p>
    </div>
  );
}
