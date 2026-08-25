import {
  getExerciseRegistryStatus,
  type ExerciseRegistryRecord,
  type ExerciseRegistryStatus,
} from "./exercise-registry.ts";

export type ExerciseRegistryFilter = "ALL" | ExerciseRegistryStatus;
export type ExerciseRegistryViewState = "LOADING" | "ERROR" | "EMPTY" | "READY";

export function getExerciseRegistryViewState(input: {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly recordCount?: number;
}): ExerciseRegistryViewState {
  if (input.isPending) return "LOADING";
  if (input.isError) return "ERROR";
  return input.recordCount === 0 ? "EMPTY" : "READY";
}

export function filterExerciseRegistryRecords(
  records: readonly ExerciseRegistryRecord[],
  filter: ExerciseRegistryFilter,
): ExerciseRegistryRecord[] {
  return records
    .filter((record) => filter === "ALL" || getExerciseRegistryStatus(record) === filter)
    .sort((a, b) => a.exerciseNumber - b.exerciseNumber);
}
