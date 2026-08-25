import {
  calculateCore150ResolutionSummary,
  resolveCore150DatabaseExercises,
  type Core150ResolutionSummary,
  type ExerciseDatabaseRow,
} from "./exercise-registry-assembler.ts";
import type { Core150Exercise } from "./core-150-exercises.ts";
import { EXERCISE_MEDIA_ROOT, getExerciseAssignedRole } from "./exercise-media.ts";
import { resolveExerciseMediaStatus } from "./exercise-registry-media.ts";
import {
  calculateExerciseDashboard,
  type ExerciseRegistryDashboard,
  type ExerciseRegistryRecord,
} from "./exercise-registry.ts";
import type { MediaItem } from "../services/media.service.ts";

export interface ExerciseRegistryDiagnostics {
  readonly unresolvedCoreExercises: readonly Core150Exercise[];
  readonly ignoredDatabaseRows: number;
  readonly unassignedMediaPaths: readonly string[];
  readonly unexpectedMediaFolders: readonly string[];
}

export interface ExerciseRegistryReadModel {
  readonly records: readonly ExerciseRegistryRecord[];
  readonly dashboard: ExerciseRegistryDashboard;
  readonly resolutionSummary: Core150ResolutionSummary;
  readonly diagnostics: ExerciseRegistryDiagnostics;
}

export interface ExerciseRegistryReadDependencies {
  readonly readDatabaseExercises: () => Promise<readonly ExerciseDatabaseRow[]>;
  readonly readStorageItems: () => Promise<readonly MediaItem[]>;
}

interface ParsedExerciseMediaPath {
  readonly exerciseId: string;
  readonly folder: string;
  readonly isDirectChild: boolean;
}

function parseExerciseMediaPath(path: string): ParsedExerciseMediaPath | null {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const segments = normalized.split("/");
  if (segments[0] !== EXERCISE_MEDIA_ROOT || segments.length < 3) return null;

  return {
    exerciseId: segments[1],
    folder: segments.slice(0, -1).join("/"),
    isDirectChild: segments.length === 3,
  };
}

function latestAssignedMediaUpdate(items: readonly MediaItem[]): string | undefined {
  return items.reduce<string | undefined>((latest, item) => {
    if (!getExerciseAssignedRole(item) || !item.updatedAt) return latest;
    return latest === undefined || item.updatedAt > latest ? item.updatedAt : latest;
  }, undefined);
}

export function buildExerciseRegistryReadModel(
  databaseRows: readonly ExerciseDatabaseRow[],
  storageItems: readonly MediaItem[],
): ExerciseRegistryReadModel {
  const resolution = resolveCore150DatabaseExercises(databaseRows);
  const resolutionSummary = calculateCore150ResolutionSummary(resolution);
  const resolvedIds = new Set(resolution.resolved.map((exercise) => exercise.exerciseId));
  const mediaByExerciseId = new Map<string, MediaItem[]>();
  const unassignedMediaPaths: string[] = [];
  const unexpectedMediaFolders = new Set<string>();

  for (const item of storageItems) {
    const parsed = parseExerciseMediaPath(item.path);
    if (!parsed) {
      unexpectedMediaFolders.add(item.folder || "<outside-exercises-root>");
      continue;
    }
    if (!parsed.isDirectChild || !resolvedIds.has(parsed.exerciseId)) {
      unexpectedMediaFolders.add(parsed.folder);
      continue;
    }

    const exerciseItems = mediaByExerciseId.get(parsed.exerciseId) ?? [];
    exerciseItems.push(item);
    mediaByExerciseId.set(parsed.exerciseId, exerciseItems);
    if (!getExerciseAssignedRole(item)) unassignedMediaPaths.push(item.path);
  }

  const records: ExerciseRegistryRecord[] = resolution.resolved.map((identity) => {
    const items = mediaByExerciseId.get(identity.exerciseId) ?? [];
    const lastUpdated = latestAssignedMediaUpdate(items);
    return {
      ...identity,
      media: resolveExerciseMediaStatus(items, identity.exerciseId),
      ...(lastUpdated ? { lastUpdated } : {}),
    };
  });

  return {
    records,
    dashboard: calculateExerciseDashboard(records),
    resolutionSummary,
    diagnostics: {
      unresolvedCoreExercises: resolution.unresolvedCoreExercises,
      ignoredDatabaseRows: resolutionSummary.ignoredDatabaseRowsCount,
      unassignedMediaPaths,
      unexpectedMediaFolders: [...unexpectedMediaFolders].sort(),
    },
  };
}

export async function loadExerciseRegistryReadModel(
  dependencies: ExerciseRegistryReadDependencies,
): Promise<ExerciseRegistryReadModel> {
  const [databaseRows, storageItems] = await Promise.all([
    dependencies.readDatabaseExercises(),
    dependencies.readStorageItems(),
  ]);
  return buildExerciseRegistryReadModel(databaseRows, storageItems);
}
