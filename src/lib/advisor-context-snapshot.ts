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
  | "limitations"
  | "medical"
  | "progress"
  | "labResults"
  | "healthMetrics";

export interface SafeMedicalIssue {
  conditionLabel: string;
  categoryLabel: string | null;
  status: "active" | "monitoring" | "resolved";
  severityBand: "low" | "medium" | "high";
  activityLimitation: string | null;
  sensitivityCategory: string | null;
  recoveryStatus: string | null;
  safetyGuidance: string | null;
  effectiveDate: string | null;
  freshness: "current" | "stale";
}

/** A single blood/lab marker the user logged, extracted from their own typed
 *  fields — never the scanned document or an image path (see ADR 003). */
export interface SafeLabResult {
  lab: string | null;
  marker: string | null;
  value: string | null;
  summary: string | null;
  testDate: string | null;
  /** A blood test stays clinically relevant far longer than the generic
   *  36h fact staleness window, so freshness is judged on its own terms
   *  (same 180-day cutoff as medical issues), not by the outer fact state. */
  freshness: "current" | "stale";
}

/** Latest sample per wearable/manual metric type, for a compact readiness view. */
export interface SafeHealthMetricsSummary {
  restingHeartRate: { value: number; unit: string; recordedAt: string } | null;
  sleepMinutes: { value: number; unit: string; recordedAt: string } | null;
  steps: { value: number; unit: string; recordedAt: string } | null;
  caloriesBurned: { value: number; unit: string; recordedAt: string } | null;
  workoutMinutes: { value: number; unit: string; recordedAt: string } | null;
}

export interface SafeProgressSummary {
  weightTrend: {
    direction: "up" | "down" | "stable" | "insufficient_data";
    changeKg: number | null;
    fromDate: string | null;
    toDate: string | null;
  };
  bodyMeasurementTrends: Array<{
    area: string;
    direction: "up" | "down" | "stable" | "insufficient_data";
    changeCm: number | null;
    fromDate: string | null;
    toDate: string | null;
  }>;
  observedAt: string | null;
  freshness: "current" | "stale" | "missing";
}

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

/** Approved Advisor Personal Context V1 basic-profile block. `birthDate` is
 *  deliberately absent — the bridge derives an integer `age` server-side and
 *  never forwards the raw date. All fields are optional/nullable: a missing
 *  value stays missing/null, it is never inferred. */
export interface AdvisorContextProfileInput {
  displayName?: string | null;
  timezone?: string | null;
  gender?: "male" | "female" | "other" | null;
  age?: number | null;
  heightCm?: number | null;
  currentWeightKg?: number | null;
}

export interface AdvisorContextInput {
  userId: string;
  now: Date;
  profile?: AdvisorContextProfileInput | null;
  goals?: string[];
  bioDay?: BioDayRecord | null;
  shift?: { kind: string; source: string; observedAt?: string | null } | null;
  medical?: SafeMedicalIssue[];
  progress?: SafeProgressSummary | null;
  labResults?: SafeLabResult[];
  healthMetrics?: SafeHealthMetricsSummary | null;
  timeline: UnifiedTimelineItem[];
  conflicts?: AdvisorContextKey[];
}

/**
 * Server-side integer age from a `YYYY-MM-DD` (or ISO) birth date, by exact
 * calendar comparison in UTC — never an elapsed-time approximation.
 *
 * Returns `null` (age unknown, never guessed) when the input is null/empty,
 * unparseable, or in the future. The raw birth date is used only here; callers
 * pass on the returned integer and nothing else.
 */
export function computeAgeFromBirthDate(
  birthDate: string | null | undefined,
  now: Date,
): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  if (birth.getTime() > now.getTime()) return null;

  const by = birth.getUTCFullYear();
  const bm = birth.getUTCMonth();
  const bd = birth.getUTCDate();
  const ny = now.getUTCFullYear();
  const nm = now.getUTCMonth();
  const nd = now.getUTCDate();

  let age = ny - by;
  // Subtract a year if this year's birthday has not occurred yet. A Feb-29
  // birth date rolls over on Mar 1 in non-leap years.
  if (nm < bm || (nm === bm && nd < bd)) age -= 1;

  return age >= 0 && Number.isFinite(age) ? age : null;
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
              gender: input.profile.gender ?? null,
              age: input.profile.age ?? null,
              heightCm: input.profile.heightCm ?? null,
              currentWeightKg: input.profile.currentWeightKg ?? null,
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
              mealNames: meals.map((entry) => entry.title).filter(Boolean),
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
              names: workouts.map((entry) => entry.title).filter(Boolean),
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
      medical: fact(
        input.medical?.length ? input.medical : null,
        input.medical
          ?.map((issue) => issue.effectiveDate)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
        ["medical_issues"],
        "reported",
        input.now,
        conflicting("medical"),
      ),
      progress: fact(
        input.progress,
        input.progress?.observedAt ?? null,
        ["weights_history", "body_measurements"],
        "measured",
        input.now,
        conflicting("progress"),
      ),
      labResults: fact(
        input.labResults?.length ? input.labResults : null,
        input.labResults
          ?.map((result) => result.testDate)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
        ["vision_captures"],
        "reported",
        input.now,
        conflicting("labResults"),
      ),
      healthMetrics: fact(
        input.healthMetrics && Object.values(input.healthMetrics).some((sample) => sample !== null)
          ? input.healthMetrics
          : null,
        [
          input.healthMetrics?.restingHeartRate?.recordedAt,
          input.healthMetrics?.sleepMinutes?.recordedAt,
          input.healthMetrics?.steps?.recordedAt,
          input.healthMetrics?.caloriesBurned?.recordedAt,
          input.healthMetrics?.workoutMinutes?.recordedAt,
        ]
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null,
        ["health_metrics"],
        "measured",
        input.now,
        conflicting("healthMetrics"),
      ),
    },
  };
}

// Every advisor is one brain shared across domains: each gets the user's full
// day (nutrition, workouts, sleep, medical, etc.), not just its own slice, so
// it can reason about the whole picture before answering within its own
// domain boundaries (see instructions.ts / configs.ts domainBoundaries).
const ALL_CONTEXT_KEYS: readonly AdvisorContextKey[] = [
  "profile",
  "goals",
  "bioDay",
  "shift",
  "nutrition",
  "hydration",
  "workouts",
  "sleep",
  "recovery",
  "limitations",
  "medical",
  "progress",
  "labResults",
  "healthMetrics",
];

const SELECTOR_KEYS = {
  adam: ALL_CONTEXT_KEYS,
  daniel: ALL_CONTEXT_KEYS,
  maya: ALL_CONTEXT_KEYS,
  shiran: ALL_CONTEXT_KEYS,
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
