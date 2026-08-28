export const BIO_DAY_SOURCES = [
  "explicit",
  "shift_inferred",
  "schedule_inferred",
  "legacy_fallback",
  "manual_correction",
] as const;

export type BioDaySource = (typeof BIO_DAY_SOURCES)[number];
export type BioDayStatus = "open" | "closed" | "corrected";

export interface BioDayRecord {
  id: string;
  userId: string;
  timezone: string;
  startsAt: string;
  endsAt: string | null;
  localDate: string;
  source: BioDaySource;
  status: BioDayStatus;
  boundaryMetadata: Record<string, unknown>;
  correctionMetadata: Record<string, unknown> | null;
  correctedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BioDayBoundaryInput {
  now: Date;
  timezone: string;
  explicitWakeAt?: Date | null;
  shiftStartAt?: Date | null;
  scheduleStartAt?: Date | null;
}

export interface ResolvedBioDayBoundary {
  startsAt: string;
  localDate: string;
  timezone: string;
  source: Exclude<BioDaySource, "manual_correction">;
  metadata: Record<string, unknown>;
}

export interface BioDayAssignment {
  id: string;
  userId: string;
  bioDayId: string;
  sourceDomain: string;
  sourceTable: BioDayAssignableTable;
  sourceRecordId: string;
  source: "timestamp_resolved" | "legacy_adapted" | "manual_correction" | "imported";
  assignmentMetadata: Record<string, unknown>;
}

export const BIO_DAY_ASSIGNABLE_TABLES = [
  "nutrition_entries",
  "daily_events",
  "workout_instances",
  "workout_sessions",
  "workouts",
  "health_logs",
] as const;

export type BioDayAssignableTable = (typeof BIO_DAY_ASSIGNABLE_TABLES)[number];

export interface BioDayStore {
  findOpen(userId: string): Promise<BioDayRecord | null>;
  findContaining(userId: string, occurredAt: string): Promise<BioDayRecord | null>;
  create(input: Omit<BioDayRecord, "id" | "createdAt" | "updatedAt">): Promise<BioDayRecord>;
  update(
    userId: string,
    bioDayId: string,
    patch: Partial<
      Pick<
        BioDayRecord,
        | "startsAt"
        | "endsAt"
        | "localDate"
        | "source"
        | "status"
        | "boundaryMetadata"
        | "correctionMetadata"
        | "correctedAt"
      >
    >,
  ): Promise<BioDayRecord>;
  assign(input: Omit<BioDayAssignment, "id">): Promise<BioDayAssignment>;
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function formatDateInTimezone(date: Date, timezone: string): string {
  const p = zonedParts(date, timezone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Resolve a wall-clock time with IANA timezone rules, including DST offsets. */
export function zonedDateTimeToInstant(
  localDate: string,
  time: { hour: number; minute?: number; second?: number },
  timezone: string,
): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  let guess = Date.UTC(year, month - 1, day, time.hour, time.minute ?? 0, time.second ?? 0);
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = zonedParts(new Date(guess), timezone);
    const renderedAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const wantedAsUtc = Date.UTC(
      year,
      month - 1,
      day,
      time.hour,
      time.minute ?? 0,
      time.second ?? 0,
    );
    const next = guess + (wantedAsUtc - renderedAsUtc);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function previousLocalDate(date: Date, timezone: string): string {
  return formatDateInTimezone(new Date(date.getTime() - 24 * 60 * 60 * 1000), timezone);
}

export function resolveBioDayBoundary(input: BioDayBoundaryInput): ResolvedBioDayBoundary {
  const candidates = [
    { at: input.explicitWakeAt, source: "explicit" as const },
    { at: input.shiftStartAt, source: "shift_inferred" as const },
    { at: input.scheduleStartAt, source: "schedule_inferred" as const },
  ];
  const chosen = candidates.find(
    (candidate) => candidate.at && candidate.at.getTime() <= input.now.getTime(),
  );
  if (chosen?.at) {
    return {
      startsAt: chosen.at.toISOString(),
      localDate: formatDateInTimezone(chosen.at, input.timezone),
      timezone: input.timezone,
      source: chosen.source,
      metadata: { inferred: chosen.source !== "explicit" },
    };
  }

  const nowParts = zonedParts(input.now, input.timezone);
  const localDate =
    nowParts.hour < 5
      ? previousLocalDate(input.now, input.timezone)
      : formatDateInTimezone(input.now, input.timezone);
  const start = zonedDateTimeToInstant(localDate, { hour: 5 }, input.timezone);
  return {
    startsAt: start.toISOString(),
    localDate,
    timezone: input.timezone,
    source: "legacy_fallback",
    metadata: { inferred: true, fallbackHour: 5 },
  };
}

export function isTimestampWithinBioDay(record: BioDayRecord, timestamp: Date): boolean {
  const value = timestamp.getTime();
  return (
    value >= Date.parse(record.startsAt) &&
    (record.endsAt === null || value < Date.parse(record.endsAt))
  );
}

export function adaptLegacyBiologicalDay(
  legacyDate: string,
  timezone: string,
): ResolvedBioDayBoundary {
  const start = zonedDateTimeToInstant(legacyDate, { hour: 5 }, timezone);
  return {
    startsAt: start.toISOString(),
    localDate: legacyDate,
    timezone,
    source: "legacy_fallback",
    metadata: { inferred: true, legacyBiologicalDay: legacyDate, fallbackHour: 5 },
  };
}

export async function findOrCreateOpenBioDay(
  store: BioDayStore,
  userId: string,
  input: BioDayBoundaryInput,
): Promise<BioDayRecord> {
  const existing = await store.findOpen(userId);
  if (existing && isTimestampWithinBioDay(existing, input.now)) return existing;
  const boundary = resolveBioDayBoundary(input);
  return store.create({
    userId,
    timezone: boundary.timezone,
    startsAt: boundary.startsAt,
    endsAt: null,
    localDate: boundary.localDate,
    source: boundary.source,
    status: "open",
    boundaryMetadata: boundary.metadata,
    correctionMetadata: null,
    correctedAt: null,
  });
}

export async function resolveTimestampToBioDay(
  store: BioDayStore,
  userId: string,
  timestamp: Date,
): Promise<BioDayRecord | null> {
  return store.findContaining(userId, timestamp.toISOString());
}

export async function closeBioDay(
  store: BioDayStore,
  userId: string,
  bioDayId: string,
  endsAt: Date,
): Promise<BioDayRecord> {
  return store.update(userId, bioDayId, { endsAt: endsAt.toISOString(), status: "closed" });
}

export async function correctBioDay(
  store: BioDayStore,
  current: BioDayRecord,
  correction: { startsAt: Date; endsAt: Date | null; reason: string; correctedAt?: Date },
): Promise<BioDayRecord> {
  const correctedAt = correction.correctedAt ?? new Date();
  return store.update(current.userId, current.id, {
    startsAt: correction.startsAt.toISOString(),
    endsAt: correction.endsAt?.toISOString() ?? null,
    localDate: formatDateInTimezone(correction.startsAt, current.timezone),
    source: "manual_correction",
    status: correction.endsAt ? "corrected" : "open",
    correctionMetadata: {
      reason: correction.reason,
      previousStartsAt: current.startsAt,
      previousEndsAt: current.endsAt,
      previousSource: current.source,
    },
    correctedAt: correctedAt.toISOString(),
  });
}

export async function reassignEventToBioDay(
  store: BioDayStore,
  input: Omit<BioDayAssignment, "id" | "source"> & { reason: string },
): Promise<BioDayAssignment> {
  if (!BIO_DAY_ASSIGNABLE_TABLES.includes(input.sourceTable)) {
    throw new Error("Unsupported Bio Day assignment source table.");
  }
  return store.assign({
    userId: input.userId,
    bioDayId: input.bioDayId,
    sourceDomain: input.sourceDomain,
    sourceTable: input.sourceTable,
    sourceRecordId: input.sourceRecordId,
    source: "manual_correction",
    assignmentMetadata: { ...input.assignmentMetadata, reason: input.reason },
  });
}

export function formatBioDayLocalTime(timestamp: string, timezone: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}
