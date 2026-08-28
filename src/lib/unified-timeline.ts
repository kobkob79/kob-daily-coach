import { formatDateInTimezone } from "./bio-day.ts";

export type TimelineDomain =
  "nutrition" | "hydration" | "supplement" | "sleep" | "weight" | "workout" | "health";
export type TimelineSensitivity = "general" | "personal" | "sensitive";
export type TimelineClassification = "planned" | "completed";

export interface TimelineSourceRow {
  id: string;
  userId: string;
  title?: string | null;
  scheduledAt?: string | null;
  occurredAt?: string | null;
  status?: string | null;
  bioDayId?: string | null;
  metrics?: Record<string, number | string | null>;
  legacyBiologicalDay?: string | null;
  externalSource?: string | null;
}

export interface DailyEventRow extends TimelineSourceRow {
  type: "water" | "supplement" | "sleep" | "weight";
}

export interface WorkoutProjectionRow extends TimelineSourceRow {
  name?: string | null;
  instanceId?: string | null;
  legacy?: boolean;
}

export interface HealthProjectionRow extends TimelineSourceRow {
  severity?: number | null;
  notes?: string | null;
  area?: string | null;
}

export interface TimelineProvenance {
  sourceTable: string;
  sourceRecordId: string;
  kind: "direct" | "legacy" | "inferred";
  externalSource: string | null;
}

export interface UnifiedTimelineItem {
  key: string;
  sourceDomain: TimelineDomain;
  sourceTable: string;
  sourceType: string;
  sourceRecordId: string;
  userId: string;
  bioDayId: string | null;
  classification: TimelineClassification;
  scheduledAt: string | null;
  occurredAt: string | null;
  title: string;
  presentation: { metrics: Record<string, number | string | null> };
  status: string;
  provenance: TimelineProvenance;
  sensitivity: TimelineSensitivity;
  legacyFallback: boolean;
  conflict: boolean;
}

export interface UnifiedTimelineInput {
  timezone: string;
  nutritionEntries?: TimelineSourceRow[];
  dailyEvents?: DailyEventRow[];
  workoutInstances?: WorkoutProjectionRow[];
  workoutSessions?: WorkoutProjectionRow[];
  legacyWorkouts?: WorkoutProjectionRow[];
  healthLogs?: HealthProjectionRow[];
  bioDayAssignments?: ReadonlyMap<string, string>;
  explicitWorkoutLinks?: ReadonlyMap<string, string>;
}

function item(input: {
  row: TimelineSourceRow;
  domain: TimelineDomain;
  table: string;
  type: string;
  title: string;
  classification?: TimelineClassification;
  sensitivity?: TimelineSensitivity;
  metrics?: Record<string, number | string | null>;
  legacy?: boolean;
  conflict?: boolean;
  assignments?: ReadonlyMap<string, string>;
}): UnifiedTimelineItem {
  const assignmentKey = `${input.table}:${input.row.id}`;
  return {
    key: assignmentKey,
    sourceDomain: input.domain,
    sourceTable: input.table,
    sourceType: input.type,
    sourceRecordId: input.row.id,
    userId: input.row.userId,
    bioDayId: input.assignments?.get(assignmentKey) ?? input.row.bioDayId ?? null,
    classification: input.classification ?? "completed",
    scheduledAt: input.row.scheduledAt ?? null,
    occurredAt: input.row.occurredAt ?? null,
    title: input.title,
    presentation: { metrics: input.metrics ?? input.row.metrics ?? {} },
    status: input.row.status ?? "recorded",
    provenance: {
      sourceTable: input.table,
      sourceRecordId: input.row.id,
      kind: input.legacy ? "legacy" : input.row.bioDayId ? "direct" : "inferred",
      externalSource: input.row.externalSource ?? null,
    },
    sensitivity: input.sensitivity ?? "personal",
    legacyFallback: input.legacy ?? Boolean(input.row.legacyBiologicalDay),
    conflict: input.conflict ?? false,
  };
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("he-IL").replace(/\s+/g, " ");
}

function eventDate(row: TimelineSourceRow, timezone: string): string | null {
  const timestamp = row.occurredAt ?? row.scheduledAt;
  return timestamp
    ? formatDateInTimezone(new Date(timestamp), timezone)
    : (row.legacyBiologicalDay ?? null);
}

function severityBand(value: number | null | undefined): string {
  if (value == null) return "unknown";
  if (value >= 7) return "high";
  if (value >= 4) return "moderate";
  return "low";
}

/** Read-only projection. Factual rows remain in their original tables. */
export function buildUnifiedTimeline(input: UnifiedTimelineInput): UnifiedTimelineItem[] {
  const result: UnifiedTimelineItem[] = [];
  for (const row of input.nutritionEntries ?? []) {
    result.push(
      item({
        row,
        domain: "nutrition",
        table: "nutrition_entries",
        type: "meal",
        title: row.title ?? "ארוחה",
        assignments: input.bioDayAssignments,
      }),
    );
  }
  for (const row of input.dailyEvents ?? []) {
    const map = {
      water: ["hydration", "שתייה"],
      supplement: ["supplement", "תוסף"],
      sleep: ["sleep", "שינה"],
      weight: ["weight", "משקל"],
    } as const;
    const [domain, title] = map[row.type];
    result.push(
      item({
        row,
        domain,
        table: "daily_events",
        type: row.type,
        title: row.title ?? title,
        assignments: input.bioDayAssignments,
      }),
    );
  }

  const sessions = input.workoutSessions ?? [];
  const sessionsByInstance = new Set(
    sessions.flatMap((row) => (row.instanceId ? [row.instanceId] : [])),
  );
  for (const row of input.workoutInstances ?? []) {
    if (!sessionsByInstance.has(row.id)) {
      result.push(
        item({
          row,
          domain: "workout",
          table: "workout_instances",
          type: "workout_instance",
          title: row.name ?? row.title ?? "אימון מתוכנן",
          classification: "planned",
          assignments: input.bioDayAssignments,
        }),
      );
    }
  }
  for (const row of sessions) {
    result.push(
      item({
        row,
        domain: "workout",
        table: "workout_sessions",
        type: "workout_session",
        title: row.name ?? row.title ?? "אימון",
        assignments: input.bioDayAssignments,
      }),
    );
  }

  for (const row of input.legacyWorkouts ?? []) {
    const explicitModernId = input.explicitWorkoutLinks?.get(row.id);
    if (explicitModernId && sessions.some((session) => session.id === explicitModernId)) continue;
    const matches = sessions.filter(
      (session) =>
        session.userId === row.userId &&
        normalizeName(session.name ?? session.title) === normalizeName(row.name ?? row.title) &&
        eventDate(session, input.timezone) === eventDate(row, input.timezone),
    );
    if (matches.length === 1) continue;
    result.push(
      item({
        row,
        domain: "workout",
        table: "workouts",
        type: "legacy_workout",
        title: row.name ?? row.title ?? "אימון",
        legacy: true,
        conflict: matches.length > 1,
        assignments: input.bioDayAssignments,
      }),
    );
  }

  for (const row of input.healthLogs ?? []) {
    result.push(
      item({
        row,
        domain: "health",
        table: "health_logs",
        type: "health_summary",
        title: "רישום בריאות",
        sensitivity: "sensitive",
        metrics: { severity: severityBand(row.severity) },
        assignments: input.bioDayAssignments,
      }),
    );
  }

  return result.sort((a, b) => {
    const timeA = a.occurredAt ?? a.scheduledAt ?? "";
    const timeB = b.occurredAt ?? b.scheduledAt ?? "";
    return timeA.localeCompare(timeB) || a.key.localeCompare(b.key);
  });
}
