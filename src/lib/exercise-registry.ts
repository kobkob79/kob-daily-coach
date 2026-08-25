import { normalizeCore150ExerciseName, type Core150Exercise } from "./core-150-exercises.ts";

export interface ExerciseMediaStatus {
  readonly hasCover: boolean;
  readonly hasInfographic: boolean;
  readonly hasThumbnail: boolean;
  readonly hasDemo: boolean;
}

export type ExerciseRegistryStatus = "NOT_STARTED" | "PARTIAL" | "COMPLETE";

export interface ExerciseRegistryRecord extends Pick<
  Core150Exercise,
  "exerciseNumber" | "canonicalHebrewName" | "englishName" | "aliases" | "muscleGroup"
> {
  readonly exerciseId: string;
  readonly media: ExerciseMediaStatus;
  readonly lastUpdated?: string;
}

export interface ExerciseRegistryDashboard {
  readonly totalExercises: number;
  readonly completedExercises: number;
  readonly partialExercises: number;
  readonly notStartedExercises: number;
  readonly coversComplete: number;
  readonly infographicsComplete: number;
  readonly thumbnailsComplete: number;
  readonly demosComplete: number;
  readonly overallProgressPercent: number;
  readonly nextRecommendedExercise: ExerciseRegistryRecord | null;
}

export function calculateExerciseStatus(media: ExerciseMediaStatus): ExerciseRegistryStatus {
  if (media.hasCover && media.hasInfographic) return "COMPLETE";
  if (media.hasCover || media.hasInfographic || media.hasThumbnail || media.hasDemo) {
    return "PARTIAL";
  }
  return "NOT_STARTED";
}

export function getExerciseRegistryStatus(record: ExerciseRegistryRecord): ExerciseRegistryStatus {
  return calculateExerciseStatus(record.media);
}

export function getCompletedExercises(
  records: readonly ExerciseRegistryRecord[],
): ExerciseRegistryRecord[] {
  return records.filter((record) => getExerciseRegistryStatus(record) === "COMPLETE");
}

export function getPartialExercises(
  records: readonly ExerciseRegistryRecord[],
): ExerciseRegistryRecord[] {
  return records.filter((record) => getExerciseRegistryStatus(record) === "PARTIAL");
}

export function getNotStartedExercises(
  records: readonly ExerciseRegistryRecord[],
): ExerciseRegistryRecord[] {
  return records.filter((record) => getExerciseRegistryStatus(record) === "NOT_STARTED");
}

export function getExerciseById(
  records: readonly ExerciseRegistryRecord[],
  exerciseId: string,
): ExerciseRegistryRecord | undefined {
  return records.find((record) => record.exerciseId === exerciseId);
}

export function getExerciseByName(
  records: readonly ExerciseRegistryRecord[],
  name: string | null | undefined,
): ExerciseRegistryRecord | undefined {
  if (!name?.trim()) return undefined;

  const normalizedName = normalizeCore150ExerciseName(name);
  const matches = records.filter((record) =>
    [record.canonicalHebrewName, record.englishName, ...record.aliases].some(
      (candidate) => normalizeCore150ExerciseName(candidate) === normalizedName,
    ),
  );

  if (matches.length > 1) {
    throw new Error(`Ambiguous Exercise Registry name "${name}" matches multiple records`);
  }

  return matches[0];
}

export function getNextRecommendedExercise(
  records: readonly ExerciseRegistryRecord[],
): ExerciseRegistryRecord | null {
  const byExerciseNumber = (a: ExerciseRegistryRecord, b: ExerciseRegistryRecord) =>
    a.exerciseNumber - b.exerciseNumber;

  const partial = getPartialExercises(records).sort(byExerciseNumber)[0];
  if (partial) return partial;

  return getNotStartedExercises(records).sort(byExerciseNumber)[0] ?? null;
}

export function calculateExerciseDashboard(
  records: readonly ExerciseRegistryRecord[],
): ExerciseRegistryDashboard {
  const completedExercises = getCompletedExercises(records).length;
  const totalExercises = records.length;

  return {
    totalExercises,
    completedExercises,
    partialExercises: getPartialExercises(records).length,
    notStartedExercises: getNotStartedExercises(records).length,
    coversComplete: records.filter((record) => record.media.hasCover).length,
    infographicsComplete: records.filter((record) => record.media.hasInfographic).length,
    thumbnailsComplete: records.filter((record) => record.media.hasThumbnail).length,
    demosComplete: records.filter((record) => record.media.hasDemo).length,
    overallProgressPercent: totalExercises === 0 ? 0 : (completedExercises / totalExercises) * 100,
    nextRecommendedExercise: getNextRecommendedExercise(records),
  };
}
