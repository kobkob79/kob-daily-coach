/**
 * Character Assets module (/dev/characters).
 *
 * Browses every registered character and asset category straight from
 * Supabase Storage through the generic media layer. No filename is ever
 * hardcoded, so newly uploaded files appear automatically.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { DevConsoleShell } from "@/components/dev/DevConsoleShell";
import { MediaGallery } from "@/components/media/MediaGallery";
import { Button } from "@/components/ui/button";
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
import { characterAssetsQueryKey } from "@/hooks/useCharacterAssets";

export const Route = createFileRoute("/_authenticated/dev/characters")({
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
      { title: "נכסי דמויות · קונסולת מפתחים | Viora" },
      {
        name: "description",
        content: "עיון בנכסי הדמויות של Viora מהאחסון לפי דמות וקטגוריה.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "נכסי דמויות · קונסולת מפתחים | Viora" },
      {
        property: "og:description",
        content: "עיון בנכסי הדמויות של Viora מהאחסון.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CharacterAssetsModule,
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

function CharacterAssetsModule() {
  const { character, category } = Route.useSearch() as {
    character: CharacterId;
    category: AssetCategory;
  };
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();

  return (
    <DevConsoleShell
      title="נכסי דמויות"
      subtitle="נטען אוטומטית מהאחסון — ללא שמות קבצים בקוד"
      activeModuleId="character-assets"
    >
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {CHARACTER_IDS.map((c) => (
          <Chip
            key={c}
            active={c === character}
            muted={!POPULATED_CHARACTERS.includes(c)}
            label={CHARACTER_LABELS[c]}
            onClick={() => navigate({ search: { character: c, category } })}


          />
        ))}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {ASSET_CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            active={cat === category}
            label={CATEGORY_LABELS[cat]}
            onClick={() => navigate({ search: { character, category: cat } })}


          />
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            qc.invalidateQueries({
              queryKey: characterAssetsQueryKey(character, category),
            })
          }
        >
          <RefreshCw className="h-3.5 w-3.5" />
          רענון
        </Button>
      </div>

      <MediaGallery
        characterId={character}
        category={category}
        title={`${CHARACTER_LABELS[character]} · ${CATEGORY_LABELS[category]}`}
      />

      <p className="pb-8 text-center text-[11px] text-muted-foreground">
        {`characters/${character}/${category}`}
      </p>
    </DevConsoleShell>
  );
}
