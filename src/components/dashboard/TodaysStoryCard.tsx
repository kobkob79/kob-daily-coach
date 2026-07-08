import { useEffect, useMemo, useState } from "react";
import { BookOpenText, Check, Pencil } from "lucide-react";
import { PremiumCard } from "@/components/ui-kit/Section";
import { cn } from "@/lib/utils";

type LocationKey = "home" | "work" | "vacation" | "active";

const LOCATIONS: { key: LocationKey; label: string; emoji: string }[] = [
  { key: "home", label: "בבית", emoji: "🏠" },
  { key: "work", label: "בעבודה", emoji: "💼" },
  { key: "vacation", label: "חופש / טיול", emoji: "✈️" },
  { key: "active", label: "יום פעיל אחר", emoji: "🏃" },
];

const INTENSITY: Record<LocationKey, string[]> = {
  home: ["רגוע", "רגיל", "פעיל", "מאומץ"],
  work: ["רגועה", "רגילה", "מאומצת", "קשה מאוד"],
  vacation: ["רגוע", "רגיל", "פעיל", "מאומץ"],
  active: ["רגוע", "רגיל", "פעיל", "מאומץ"],
};

type StoryState = {
  location: LocationKey | null;
  intensity: string | null;
  note: string;
};

const EMPTY: StoryState = { location: null, intensity: null, note: "" };

function storageKey(bioDay: string) {
  return `viora.todaysStory.${bioDay}`;
}

export function TodaysStoryCard({ bioDay }: { bioDay: string }) {
  const [state, setState] = useState<StoryState>(EMPTY);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(bioDay));
      if (raw) {
        const parsed = JSON.parse(raw) as StoryState;
        setState({ ...EMPTY, ...parsed });
        setEditing(false);
      } else {
        setState(EMPTY);
        setEditing(true);
      }
    } catch {
      setEditing(true);
    }
  }, [bioDay]);

  const save = (next: StoryState) => {
    setState(next);
    try {
      localStorage.setItem(storageKey(bioDay), JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  };

  const locationMeta = useMemo(
    () => LOCATIONS.find((l) => l.key === state.location) ?? null,
    [state.location],
  );

  const hasStory = state.location != null;

  if (!editing && hasStory) {
    return (
      <PremiumCard>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-md">
              <BookOpenText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                הסיפור של היום
              </p>
              <p className="text-base font-semibold">
                {locationMeta?.emoji} {locationMeta?.label}
                {state.intensity && (
                  <span className="ms-2 text-sm font-normal text-muted-foreground">
                    · {state.intensity}
                  </span>
                )}
              </p>
              {state.note.trim() && (
                <p className="mt-1.5 text-sm text-foreground/80 whitespace-pre-wrap break-words">
                  “{state.note.trim()}”
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 grid h-9 w-9 place-items-center rounded-xl bg-muted/50 text-muted-foreground hover:text-foreground"
            aria-label="ערוך"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </PremiumCard>
    );
  }

  const intensities = state.location ? INTENSITY[state.location] : [];

  return (
    <PremiumCard>
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-md">
          <BookOpenText className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            📖 הסיפור של היום
          </p>
          <p className="text-base font-semibold">ספר לי איך נראה היום שלך</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">איפה תהיה היום?</p>
        <div className="grid grid-cols-2 gap-2">
          {LOCATIONS.map((l) => {
            const active = state.location === l.key;
            return (
              <button
                key={l.key}
                type="button"
                onClick={() =>
                  save({ ...state, location: l.key, intensity: null })
                }
                className={cn(
                  "rounded-2xl border p-3 text-start transition-all",
                  active
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border/60 bg-muted/30 hover:border-primary/40",
                )}
              >
                <div className="text-xl">{l.emoji}</div>
                <div className="mt-1 text-sm font-medium">{l.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {state.location && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">רמת עומס</p>
          <div className="flex flex-wrap gap-2">
            {intensities.map((intensity) => {
              const active = state.intensity === intensity;
              return (
                <button
                  key={intensity}
                  type="button"
                  onClick={() => save({ ...state, intensity })}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm transition-all",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border/60 bg-muted/30 hover:border-primary/40",
                  )}
                >
                  {intensity}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">
          תיאור חופשי (אופציונלי)
        </p>
        <textarea
          value={state.note}
          onChange={(e) => save({ ...state, note: e.target.value })}
          placeholder='למשל: "היום היה לי PM פיזי במשך 5 שעות"'
          rows={3}
          className="w-full rounded-2xl border border-border/60 bg-muted/20 p-3 text-sm outline-none focus:border-primary transition-colors resize-none"
          dir="rtl"
        />
      </div>

      {hasStory && (
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="mt-4 w-full rounded-2xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground flex items-center justify-center gap-2"
        >
          <Check className="h-4 w-4" />
          שמור את הסיפור של היום
        </button>
      )}
    </PremiumCard>
  );
}
