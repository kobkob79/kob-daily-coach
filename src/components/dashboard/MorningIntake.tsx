/**
 * Morning Intake — full-screen overlay shown once per biological day.
 *
 * Collects the day's context (location, intensity, mood, sleep, free text),
 * persists it into ai_memory as `day_intake:<bioDay>`, derives adaptive
 * targets stored as `day_targets:<bioDay>`, and extracts personal facts
 * from the free-text note into `personal_facts`.
 */
import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMemory, setMemory, patchMemory } from "@/lib/ai-memory";

type Location = "work" | "home" | "vacation" | "study" | "trip" | "other";
type Intensity = "calm" | "medium" | "hard";
type Mood = "great" | "good" | "ok" | "tired" | "exhausted";

export type DayIntake = {
  location: Location;
  intensity: Intensity;
  mood: Mood;
  sleepHours: number;
  note: string;
  createdAt: string;
};

export type DayTargets = {
  water_ml: number;
  protein_g: number;
  steps: number;
  activity_min: number;
  recommendations: string[];
  warnings: string[];
};

const LOCATIONS: { key: Location; label: string; emoji: string }[] = [
  { key: "work", label: "עבודה", emoji: "💼" },
  { key: "home", label: "בית", emoji: "🏠" },
  { key: "vacation", label: "חופש", emoji: "✈️" },
  { key: "study", label: "לימודים", emoji: "📚" },
  { key: "trip", label: "טיול", emoji: "🏞️" },
  { key: "other", label: "אחר", emoji: "✨" },
];

const INTENSITIES: { key: Intensity; label: string; dot: string }[] = [
  { key: "calm", label: "רגועה", dot: "🟢" },
  { key: "medium", label: "בינונית", dot: "🟡" },
  { key: "hard", label: "מאומצת", dot: "🔴" },
];

const MOODS: { key: Mood; label: string; emoji: string }[] = [
  { key: "great", label: "מעולה", emoji: "😀" },
  { key: "good", label: "טוב", emoji: "🙂" },
  { key: "ok", label: "רגיל", emoji: "😐" },
  { key: "tired", label: "עייף", emoji: "😕" },
  { key: "exhausted", label: "מותש", emoji: "😣" },
];

function deriveTargets(intake: DayIntake): DayTargets {
  let water = 3000;
  let protein = 160;
  let steps = 8000;
  let activity = 30;
  const recs: string[] = [];
  const warns: string[] = [];

  if (intake.intensity === "hard") {
    water += 800;
    activity += 15;
    recs.push("יום מאומץ — הקפד לשתות מים כל שעה.");
  } else if (intake.intensity === "calm") {
    water -= 300;
    activity -= 10;
  }

  if (intake.location === "work") {
    steps = Math.max(steps, 9000);
    recs.push("הוסף הליכה קצרה בין המשימות.");
  } else if (intake.location === "vacation") {
    protein -= 20;
    recs.push("תיהנה מהיום — שמור על שתייה.");
  } else if (intake.location === "trip") {
    steps += 3000;
    water += 500;
  } else if (intake.location === "home") {
    steps = Math.max(6000, steps - 1000);
  }

  if (intake.sleepHours < 6) {
    warns.push("ישנת פחות מ־6 שעות — מומלץ להאט היום.");
    protein += 10;
  } else if (intake.sleepHours >= 8) {
    recs.push("שינה טובה — נצל את האנרגיה לאימון איכותי.");
  }

  if (intake.mood === "tired" || intake.mood === "exhausted") {
    warns.push("אתה מרגיש עייף — הפחת קפאין אחר הצהריים.");
    activity = Math.max(15, activity - 15);
  }

  const note = intake.note.toLowerCase();
  if (/(אימון|כוח|חדר כושר|gym)/.test(note)) {
    protein += 30;
    water += 500;
    recs.push("יש אימון היום — הוסף חלבון ושתייה סביב האימון.");
  }
  if (/(גב|כאב|פציעה)/.test(note)) {
    warns.push("שים לב לגב — הקפד על מתיחות קלות.");
  }
  if (/(משמרת|לילה|אינטל)/.test(note)) {
    water += 400;
    recs.push("משמרת ארוכה — קבע תזכורות מים כל שעה.");
  }

  return {
    water_ml: Math.round(water),
    protein_g: Math.round(protein),
    steps: Math.round(steps),
    activity_min: Math.round(activity),
    recommendations: recs,
    warnings: warns,
  };
}

function extractFacts(note: string): string[] {
  const facts: string[] = [];
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/אני עובד ב([\u0590-\u05FFa-zA-Z" ]{2,30})/, (m) => `עובד ב${m[1].trim()}`],
    [/יש לי כאבי? ([\u0590-\u05FF ]{2,20})/, (m) => `כאבי ${m[1].trim()}`],
    [/אני אוהב ([\u0590-\u05FFa-zA-Z" ]{2,30})/, (m) => `אוהב ${m[1].trim()}`],
    [/אני שונא ([\u0590-\u05FFa-zA-Z" ]{2,30})/, (m) => `שונא ${m[1].trim()}`],
    [/אני צמחוני|טבעוני/, () => "צמחוני/טבעוני"],
  ];
  for (const [re, fn] of patterns) {
    const m = note.match(re);
    if (m) facts.push(fn(m));
  }
  return facts;
}

export function MorningIntake({
  bioDay,
  onComplete,
}: {
  bioDay: string;
  onComplete: () => void;
}) {
  const [location, setLocation] = useState<Location | null>(null);
  const [intensity, setIntensity] = useState<Intensity | null>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [sleep, setSleep] = useState(7);
  const [note, setNote] = useState("");
  const [building, setBuilding] = useState(false);

  const canSubmit = location && intensity && mood && !building;

  const submit = async () => {
    if (!location || !intensity || !mood) return;
    setBuilding(true);
    const intake: DayIntake = {
      location,
      intensity,
      mood,
      sleepHours: sleep,
      note: note.trim(),
      createdAt: new Date().toISOString(),
    };
    const targets = deriveTargets(intake);
    const facts = extractFacts(intake.note);

    await Promise.all([
      setMemory(`day_intake:${bioDay}`, intake),
      setMemory(`day_targets:${bioDay}`, targets),
      facts.length
        ? (async () => {
            const existing = (await getMemory<string[]>("personal_facts")) ?? [];
            const merged = Array.from(new Set([...existing, ...facts])).slice(-40);
            await setMemory("personal_facts", merged);
          })()
        : Promise.resolve(),
    ]);

    // small delay for the "AI thinking" animation
    await new Promise((r) => setTimeout(r, 2200));
    setBuilding(false);
    onComplete();
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 overflow-y-auto bg-background/95 backdrop-blur-xl animate-fade-in"
    >
      <div className="mx-auto max-w-lg px-5 py-8 space-y-6">
        <div className="text-center space-y-2 animate-fade-in">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">בוקר טוב 👋</h1>
          <p className="text-muted-foreground">בוא נבנה את היום שלך.</p>
        </div>

        {building ? (
          <div className="py-16 flex flex-col items-center gap-4 animate-fade-in">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Viora בונה עבורך את היום…</p>
          </div>
        ) : (
          <>
            <Section title="איפה תהיה היום?">
              <div className="grid grid-cols-3 gap-2">
                {LOCATIONS.map((l) => (
                  <ChoiceBtn
                    key={l.key}
                    active={location === l.key}
                    onClick={() => setLocation(l.key)}
                  >
                    <div className="text-xl">{l.emoji}</div>
                    <div className="mt-1 text-sm">{l.label}</div>
                  </ChoiceBtn>
                ))}
              </div>
            </Section>

            <Section title="רמת הפעילות">
              <div className="grid grid-cols-3 gap-2">
                {INTENSITIES.map((i) => (
                  <ChoiceBtn
                    key={i.key}
                    active={intensity === i.key}
                    onClick={() => setIntensity(i.key)}
                  >
                    <div className="text-xl">{i.dot}</div>
                    <div className="mt-1 text-sm">{i.label}</div>
                  </ChoiceBtn>
                ))}
              </div>
            </Section>

            <Section title="איך אתה מרגיש?">
              <div className="grid grid-cols-5 gap-2">
                {MOODS.map((m) => (
                  <ChoiceBtn
                    key={m.key}
                    active={mood === m.key}
                    onClick={() => setMood(m.key)}
                  >
                    <div className="text-xl">{m.emoji}</div>
                    <div className="mt-0.5 text-[11px]">{m.label}</div>
                  </ChoiceBtn>
                ))}
              </div>
            </Section>

            <Section title={`כמה שעות ישנת? · ${sleep} שעות`}>
              <input
                type="range"
                min={3}
                max={10}
                step={0.5}
                value={sleep}
                onChange={(e) => setSleep(Number(e.target.value))}
                className="w-full accent-primary"
                dir="ltr"
              />
            </Section>

            <Section title="ספר ל־Viora בקצרה על היום שלך">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                dir="rtl"
                placeholder='לדוגמה: "היום יש לי משמרת באינטל" · "יש לי אימון ערב" · "אני עם כאבי גב"'
                className="w-full rounded-2xl border border-border/60 bg-muted/20 p-3 text-sm outline-none focus:border-primary transition-colors resize-none"
              />
            </Section>

            <button
              type="button"
              disabled={!canSubmit}
              onClick={submit}
              className={cn(
                "w-full rounded-2xl py-3.5 text-base font-semibold flex items-center justify-center gap-2 transition-all",
                canSubmit
                  ? "bg-primary text-primary-foreground shadow-lg hover:opacity-90"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Sparkles className="h-5 w-5" />
              התחל את היום
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 animate-fade-in">
      <p className="text-sm font-medium text-foreground/80">{title}</p>
      {children}
    </div>
  );
}

function ChoiceBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-3 text-center transition-all",
        active
          ? "border-primary bg-primary/10 shadow-sm"
          : "border-border/60 bg-muted/30 hover:border-primary/40",
      )}
    >
      {children}
    </button>
  );
}
