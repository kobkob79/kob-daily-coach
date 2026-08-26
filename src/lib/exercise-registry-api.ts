import {
  calculateExerciseDashboard,
  getCompletedExercises,
  getExerciseById,
  getExerciseByName,
  getExerciseRegistryStatus,
  getNextRecommendedExercise,
  getNotStartedExercises,
  getPartialExercises,
  type ExerciseRegistryDashboard,
  type ExerciseRegistryRecord,
  type ExerciseRegistryStatus,
} from "./exercise-registry.ts";
import type {
  ExerciseRegistryDiagnostics as RegistryDiagnostics,
  ExerciseRegistryReadModel,
} from "./exercise-registry-read-model.ts";

export type ExerciseRegistry = ExerciseRegistryReadModel;
export type ExerciseRegistryEntry = ExerciseRegistryRecord;
export type ExerciseRegistryProgress = ExerciseRegistryDashboard;
export type ExerciseRegistryDiagnostics = RegistryDiagnostics;

export type ExerciseRegistryMissingAsset = "cover" | "infographic" | "thumbnail" | "demo";

export interface ExerciseRegistrySnapshotEntry {
  readonly exerciseId: string;
  readonly exerciseNumber: number;
  readonly canonicalHebrewName: string;
  readonly englishName: string;
  readonly muscleGroup: string;
  readonly status: ExerciseRegistryStatus;
  readonly media: ExerciseRegistryRecord["media"];
  readonly missingAssets: readonly ExerciseRegistryMissingAsset[];
  readonly lastUpdated?: string;
}

export interface ExerciseRegistrySnapshot {
  readonly generatedAt: string;
  readonly summary: Omit<ExerciseRegistryProgress, "nextRecommendedExercise">;
  readonly nextRecommendedExercise: ExerciseRegistrySnapshotEntry | null;
  readonly exercises: readonly ExerciseRegistrySnapshotEntry[];
  readonly diagnostics: {
    readonly unresolvedCount: number;
    readonly ignoredDatabaseRows: number;
    readonly unassignedMediaPathsCount: number;
    readonly unexpectedMediaFoldersCount: number;
  };
}

export async function getExerciseRegistry(): Promise<ExerciseRegistry> {
  const { getLiveExerciseRegistry } = await import("../services/exercise-registry.service.ts");
  return getLiveExerciseRegistry();
}

export function calculateProgress(registry: ExerciseRegistry): ExerciseRegistryProgress {
  return calculateExerciseDashboard(registry.records);
}

export function getRegistryExerciseById(
  registry: ExerciseRegistry,
  exerciseId: string,
): ExerciseRegistryEntry | undefined {
  return getExerciseById(registry.records, exerciseId);
}

export function getRegistryExerciseByNumber(
  registry: ExerciseRegistry,
  exerciseNumber: number,
): ExerciseRegistryEntry | undefined {
  return registry.records.find((record) => record.exerciseNumber === exerciseNumber);
}

export function getRegistryExerciseByName(
  registry: ExerciseRegistry,
  name: string | null | undefined,
): ExerciseRegistryEntry | undefined {
  return getExerciseByName(registry.records, name);
}

export function getIncompleteExercises(registry: ExerciseRegistry): ExerciseRegistryEntry[] {
  return registry.records.filter((record) => getExerciseRegistryStatus(record) !== "COMPLETE");
}

export function getCompleteExercises(registry: ExerciseRegistry): ExerciseRegistryEntry[] {
  return getCompletedExercises(registry.records);
}

export function getPartialExercisesFromRegistry(
  registry: ExerciseRegistry,
): ExerciseRegistryEntry[] {
  return getPartialExercises(registry.records);
}

export function getNotStartedExercisesFromRegistry(
  registry: ExerciseRegistry,
): ExerciseRegistryEntry[] {
  return getNotStartedExercises(registry.records);
}

export function getNextRecommendedRegistryExercise(
  registry: ExerciseRegistry,
): ExerciseRegistryEntry | null {
  return getNextRecommendedExercise(registry.records);
}

export function getExercisesMissingCover(registry: ExerciseRegistry): ExerciseRegistryEntry[] {
  return registry.records.filter((record) => !record.media.hasCover);
}

export function getExercisesMissingInfographic(
  registry: ExerciseRegistry,
): ExerciseRegistryEntry[] {
  return registry.records.filter((record) => !record.media.hasInfographic);
}

export function getExercisesMissingThumbnail(registry: ExerciseRegistry): ExerciseRegistryEntry[] {
  return registry.records.filter((record) => !record.media.hasThumbnail);
}

export function getExercisesMissingDemo(registry: ExerciseRegistry): ExerciseRegistryEntry[] {
  return registry.records.filter((record) => !record.media.hasDemo);
}

function getMediaProductionPriority(record: ExerciseRegistryEntry): number | null {
  const status = getExerciseRegistryStatus(record);
  if (status === "PARTIAL" && !record.media.hasInfographic) return 1;
  if (status === "PARTIAL" && !record.media.hasCover) return 2;
  if (status === "NOT_STARTED") return 3;
  if (!record.media.hasThumbnail) return 4;
  if (!record.media.hasDemo) return 5;
  return null;
}

export function getNextMediaProductionExercise(
  registry: ExerciseRegistry,
): ExerciseRegistryEntry | null {
  return (
    registry.records
      .map((record) => ({ record, priority: getMediaProductionPriority(record) }))
      .filter(
        (
          candidate,
        ): candidate is { readonly record: ExerciseRegistryEntry; readonly priority: number } =>
          candidate.priority !== null,
      )
      .sort(
        (a, b) => a.priority - b.priority || a.record.exerciseNumber - b.record.exerciseNumber,
      )[0]?.record ?? null
  );
}

function getMissingAssets(record: ExerciseRegistryEntry): ExerciseRegistryMissingAsset[] {
  const missing: ExerciseRegistryMissingAsset[] = [];
  if (!record.media.hasCover) missing.push("cover");
  if (!record.media.hasInfographic) missing.push("infographic");
  if (!record.media.hasThumbnail) missing.push("thumbnail");
  if (!record.media.hasDemo) missing.push("demo");
  return missing;
}

function buildSnapshotEntry(record: ExerciseRegistryEntry): ExerciseRegistrySnapshotEntry {
  return {
    exerciseId: record.exerciseId,
    exerciseNumber: record.exerciseNumber,
    canonicalHebrewName: record.canonicalHebrewName,
    englishName: record.englishName,
    muscleGroup: record.muscleGroup,
    status: getExerciseRegistryStatus(record),
    media: { ...record.media },
    missingAssets: getMissingAssets(record),
    ...(record.lastUpdated ? { lastUpdated: record.lastUpdated } : {}),
  };
}

export function buildExerciseRegistrySnapshot(
  registry: ExerciseRegistry,
): ExerciseRegistrySnapshot {
  const progress = calculateProgress(registry);
  const nextRecommendedExercise = getNextRecommendedRegistryExercise(registry);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalExercises: progress.totalExercises,
      completedExercises: progress.completedExercises,
      partialExercises: progress.partialExercises,
      notStartedExercises: progress.notStartedExercises,
      coversComplete: progress.coversComplete,
      infographicsComplete: progress.infographicsComplete,
      thumbnailsComplete: progress.thumbnailsComplete,
      demosComplete: progress.demosComplete,
      overallProgressPercent: progress.overallProgressPercent,
    },
    nextRecommendedExercise: nextRecommendedExercise
      ? buildSnapshotEntry(nextRecommendedExercise)
      : null,
    exercises: registry.records.map(buildSnapshotEntry),
    diagnostics: {
      unresolvedCount: registry.resolutionSummary.unresolvedCount,
      ignoredDatabaseRows: registry.diagnostics.ignoredDatabaseRows,
      unassignedMediaPathsCount: registry.diagnostics.unassignedMediaPaths.length,
      unexpectedMediaFoldersCount: registry.diagnostics.unexpectedMediaFolders.length,
    },
  };
}
