import type { BioDayRecord } from "./bio-day.ts";
import type { UnifiedTimelineItem } from "./unified-timeline.ts";

export type ContextState = "known" | "missing" | "stale" | "conflicting";
export type AdvisorContextKey =
  | "profile"
  | "goals"
  | "bioDay"
  | "shift"
  | "nutrition"
  | "hydration"
  | "workouts"
  | "sleep"
  | "recovery"
  | "limitations";

export interface ContextFact<T> {
  state: ContextState;
  value: T | null;
  observedAt: string | null;
  sources: string[];
  confidence: "measured" | "reported" | "inferred" | "unknown";
}

export interface AdvisorContextSnapshot {
  userId: string;
  generatedAt: string;
  facts: Record<AdvisorContextKey, ContextFact<unknown>>;
}

export interface AdvisorContextInput {
  userId: string;
  now: Date;
  profile?: { displayName?: string | null; timezone?: string | null } | null;
  goals?: string[];
  bioDay?: BioDayRecord | null;
  shift?: { kind: string; source: string; observedAt?: string | null } | null;
  timeline: UnifiedTimelineItem[];
  conflicts?: AdvisorContextKey[];
}

const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

function fact<T>(
  value: T | null,
  observedAt: string | null,
  sources: string[],
  confidence: ContextFact<T>["confidence"],
  now: Date,
  conflicting = false,
): ContextFact<T> {
  const state: ContextState = conflicting
    ? "conflicting"
    : value == null
      ? "missing"
      : observedAt && now.getTime() - Date.parse(observedAt) > STALE_AFTER_MS
        ? "stale"
        : "known";
  return { state, value, observedAt, sources, confidence };
}

function latest(items: UnifiedTimelineItem[]): string | null {
  return (
    items
      .map((entry) => entry.occurredAt ?? entry.scheduledAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null
  );
}

function numericTotal(items: UnifiedTimelineItem[], key: string): number {
  return items.reduce((sum, entry) => {
    const value = entry.presentation.metrics[key];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

/** Pure snapshot builder: no provider, network, Storage URL or admin metadata access. */
export function buildAdvisorContextSnapshot(input: AdvisorContextInput): AdvisorContextSnapshot {
  const byDomain = (domain: UnifiedTimelineItem["sourceDomain"]) =>
    input.timeline.filter((entry) => entry.sourceDomain === domain);
  const meals = byDomain("nutrition");
  const hydration = byDomain("hydration");
  const workouts = byDomain("workout");
  const sleep = byDomain("sleep");
  const health = byDomain("health");
  const conflicting = (key: AdvisorContextKey) => input.conflicts?.includes(key) ?? false;
  const sourceNames = (items: UnifiedTimelineItem[]) => [
    ...new Set(items.map((entry) => entry.sourceTable)),
  ];
  const limitations = health.length
    ? {
        severityBands: [
          ...new Set(health.map((entry) => entry.presentation.metrics.severity).filter(Boolean)),
        ],
      }
    : null;

  return {
    userId: input.userId,
    generatedAt: input.now.toISOString(),
    facts: {
      profile: fact(
        input.profile
          ? {
              displayName: input.profile.displayName ?? null,
              timezone: input.profile.timezone ?? null,
            }
          : null,
        null,
        ["profiles"],
        "reported",
        input.now,
        conflicting("profile"),
      ),
      goals: fact(
        input.goals?.length ? input.goals : null,
        null,
        ["profiles"],
        "reported",
        input.now,
        conflicting("goals"),
      ),
      bioDay: fact(
        input.bioDay
          ? {
              id: input.bioDay.id,
              localDate: input.bioDay.localDate,
              source: input.bioDay.source,
              timezone: input.bioDay.timezone,
            }
          : null,
        input.bioDay?.updatedAt ?? null,
        ["bio_days"],
        input.bioDay?.source === "explicit" ? "reported" : "inferred",
        input.now,
        conflicting("bioDay"),
      ),
      shift: fact(
        input.shift ? { kind: input.shift.kind, source: input.shift.source } : null,
        input.shift?.observedAt ?? null,
        ["shift_config"],
        "inferred",
        input.now,
        conflicting("shift"),
      ),
      nutrition: fact(
        meals.length
          ? {
              meals: meals.length,
              calories: numericTotal(meals, "calories"),
              proteinG: numericTotal(meals, "proteinG"),
              carbsG: numericTotal(meals, "carbsG"),
              fatG: numericTotal(meals, "fatG"),
            }
          : null,
        latest(meals),
        sourceNames(meals),
        "reported",
        input.now,
        conflicting("nutrition"),
      ),
      hydration: fact(
        hydration.length
          ? {
              totalMl: numericTotal(hydration, "ml"),
              goalMl: numericTotal(hydration, "goalMl") || null,
            }
          : null,
        latest(hydration),
        sourceNames(hydration),
        "reported",
        input.now,
        conflicting("hydration"),
      ),
      workouts: fact(
        workouts.length
          ? {
              planned: workouts.filter((entry) => entry.classification === "planned").length,
              completed: workouts.filter((entry) => entry.classification === "completed").length,
              volumeKg: numericTotal(workouts, "volumeKg"),
            }
          : null,
        latest(workouts),
        sourceNames(workouts),
        "measured",
        input.now,
        conflicting("workouts"),
      ),
      sleep: fact(
        sleep.length ? { hours: numericTotal(sleep, "hours") || null } : null,
        latest(sleep),
        sourceNames(sleep),
        "reported",
        input.now,
        conflicting("sleep"),
      ),
      recovery: fact(
        sleep.length
          ? { sleepHours: numericTotal(sleep, "hours") || null, workoutCount: workouts.length }
          : null,
        latest([...sleep, ...workouts]),
        sourceNames([...sleep, ...workouts]),
        "inferred",
        input.now,
        conflicting("recovery"),
      ),
      limitations: fact(
        limitations,
        latest(health),
        sourceNames(health),
        "reported",
        input.now,
        conflicting("limitations"),
      ),
    },
  };
}

const SELECTOR_KEYS = {
  adam: ["profile", "bioDay", "shift", "sleep", "recovery"],
  daniel: ["profile", "bioDay", "workouts", "limitations"],
  maya: ["profile", "bioDay", "recovery", "limitations"],
  shiran: ["profile", "bioDay", "goals", "nutrition", "hydration"],
} as const satisfies Record<string, readonly AdvisorContextKey[]>;

export type ContextAdvisorId = keyof typeof SELECTOR_KEYS;

export function selectAdvisorContext(
  snapshot: AdvisorContextSnapshot,
  advisorId: ContextAdvisorId,
): Pick<AdvisorContextSnapshot, "userId" | "generatedAt"> & {
  facts: Partial<Record<AdvisorContextKey, ContextFact<unknown>>>;
} {
  return {
    userId: snapshot.userId,
    generatedAt: snapshot.generatedAt,
    facts: Object.fromEntries(SELECTOR_KEYS[advisorId].map((key) => [key, snapshot.facts[key]])),
  };
}

export function toSafeAdvisorContextDebug(snapshot: AdvisorContextSnapshot) {
  return {
    generatedAt: snapshot.generatedAt,
    facts: Object.fromEntries(
      Object.entries(snapshot.facts).map(([key, value]) => [
        key,
        {
          state: value.state,
          sources: value.sources,
          confidence: value.confidence,
          hasValue: value.value !== null,
        },
      ]),
    ),
  };
}
