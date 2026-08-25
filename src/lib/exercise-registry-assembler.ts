import {
  CORE_150_EXERCISES,
  findCore150ExerciseByName,
  type Core150Exercise,
} from "./core-150-exercises.ts";

export interface ExerciseDatabaseRow {
  readonly id: string;
  readonly name: string;
  readonly owner_id: string | null;
}

export interface ResolvedCore150Exercise extends Pick<
  Core150Exercise,
  "exerciseNumber" | "canonicalHebrewName" | "englishName" | "aliases" | "muscleGroup"
> {
  readonly exerciseId: string;
  readonly sourceDatabaseName: string;
}

export type IgnoredDatabaseRowReason = "USER_OWNED" | "NON_CORE";

export interface IgnoredDatabaseExerciseRow {
  readonly row: ExerciseDatabaseRow;
  readonly reason: IgnoredDatabaseRowReason;
}

export interface Core150ResolutionResult {
  readonly resolved: readonly ResolvedCore150Exercise[];
  readonly unresolvedCoreExercises: readonly Core150Exercise[];
  readonly ignoredDatabaseRows: readonly IgnoredDatabaseExerciseRow[];
}

export interface Core150ResolutionSummary {
  readonly totalCoreExercises: number;
  readonly resolvedCount: number;
  readonly unresolvedCount: number;
  readonly ignoredDatabaseRowsCount: number;
  readonly isComplete: boolean;
}

export class DuplicateCore150MappingError extends Error {
  readonly exerciseNumber: number;
  readonly databaseRowIds: readonly [string, string];

  constructor(
    exercise: Core150Exercise,
    firstRow: ExerciseDatabaseRow,
    duplicateRow: ExerciseDatabaseRow,
  ) {
    super(
      `Core 150 exercise ${exercise.exerciseNumber} (${exercise.canonicalHebrewName}) maps to multiple database rows: ${firstRow.id}, ${duplicateRow.id}`,
    );
    this.name = "DuplicateCore150MappingError";
    this.exerciseNumber = exercise.exerciseNumber;
    this.databaseRowIds = [firstRow.id, duplicateRow.id];
  }
}

export function resolveCore150DatabaseExercises(
  databaseRows: readonly ExerciseDatabaseRow[],
): Core150ResolutionResult {
  const resolvedByNumber = new Map<
    number,
    { readonly resolved: ResolvedCore150Exercise; readonly sourceRow: ExerciseDatabaseRow }
  >();
  const ignoredDatabaseRows: IgnoredDatabaseExerciseRow[] = [];

  for (const row of databaseRows) {
    if (row.owner_id !== null) {
      ignoredDatabaseRows.push({ row, reason: "USER_OWNED" });
      continue;
    }

    const coreExercise = findCore150ExerciseByName(row.name);
    if (!coreExercise) {
      ignoredDatabaseRows.push({ row, reason: "NON_CORE" });
      continue;
    }

    const existing = resolvedByNumber.get(coreExercise.exerciseNumber);
    if (existing) {
      throw new DuplicateCore150MappingError(coreExercise, existing.sourceRow, row);
    }

    resolvedByNumber.set(coreExercise.exerciseNumber, {
      sourceRow: row,
      resolved: {
        exerciseId: row.id,
        exerciseNumber: coreExercise.exerciseNumber,
        canonicalHebrewName: coreExercise.canonicalHebrewName,
        englishName: coreExercise.englishName,
        aliases: coreExercise.aliases,
        muscleGroup: coreExercise.muscleGroup,
        sourceDatabaseName: row.name,
      },
    });
  }

  const resolved = [...resolvedByNumber.values()]
    .map(({ resolved: exercise }) => exercise)
    .sort((a, b) => a.exerciseNumber - b.exerciseNumber);
  const unresolvedCoreExercises = CORE_150_EXERCISES.filter(
    (exercise) => !resolvedByNumber.has(exercise.exerciseNumber),
  );

  return {
    resolved,
    unresolvedCoreExercises,
    ignoredDatabaseRows,
  };
}

export function calculateCore150ResolutionSummary(
  result: Core150ResolutionResult,
): Core150ResolutionSummary {
  return {
    totalCoreExercises: CORE_150_EXERCISES.length,
    resolvedCount: result.resolved.length,
    unresolvedCount: result.unresolvedCoreExercises.length,
    ignoredDatabaseRowsCount: result.ignoredDatabaseRows.length,
    isComplete:
      result.resolved.length === CORE_150_EXERCISES.length &&
      result.unresolvedCoreExercises.length === 0,
  };
}
