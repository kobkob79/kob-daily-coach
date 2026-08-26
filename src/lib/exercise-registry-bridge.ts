import {
  buildExerciseRegistrySnapshot,
  type ExerciseRegistry,
  type ExerciseRegistryMissingAsset,
  type ExerciseRegistrySnapshot,
} from "./exercise-registry-api.ts";

export const EXERCISE_REGISTRY_BRIDGE_SOURCE = "viora-exercise-registry";
export const EXERCISE_REGISTRY_BRIDGE_SCHEMA_VERSION = 1;
export const EXERCISE_REGISTRY_BRIDGE_MAX_LIMIT = 150;

const MISSING_ASSETS: readonly ExerciseRegistryMissingAsset[] = [
  "cover",
  "infographic",
  "thumbnail",
  "demo",
];

export interface ExerciseRegistryBridgePayload extends ExerciseRegistrySnapshot {
  readonly source: typeof EXERCISE_REGISTRY_BRIDGE_SOURCE;
  readonly schemaVersion: typeof EXERCISE_REGISTRY_BRIDGE_SCHEMA_VERSION;
  readonly readOnly: true;
}

export class ExerciseRegistryBridgeQueryError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = "ExerciseRegistryBridgeQueryError";
  }
}

function parseMissingAsset(value: string | null): ExerciseRegistryMissingAsset | null {
  if (value === null) return null;
  if (MISSING_ASSETS.includes(value as ExerciseRegistryMissingAsset)) {
    return value as ExerciseRegistryMissingAsset;
  }
  throw new ExerciseRegistryBridgeQueryError("Invalid missing filter");
}

function parsePositiveInteger(
  value: string | null,
  field: string,
  maximum?: number,
): number | null {
  if (value === null) return null;
  if (!/^\d+$/.test(value)) throw new ExerciseRegistryBridgeQueryError(`Invalid ${field}`);

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum !== undefined && parsed > maximum)) {
    throw new ExerciseRegistryBridgeQueryError(`Invalid ${field}`);
  }
  return parsed;
}

export function buildExerciseRegistryBridgePayload(
  registry: ExerciseRegistry,
  searchParams: URLSearchParams = new URLSearchParams(),
): ExerciseRegistryBridgePayload {
  const snapshot = buildExerciseRegistrySnapshot(registry);
  const missing = parseMissingAsset(searchParams.get("missing"));
  const exerciseNumber = parsePositiveInteger(searchParams.get("exerciseNumber"), "exerciseNumber");
  const limit = parsePositiveInteger(
    searchParams.get("limit"),
    "limit",
    EXERCISE_REGISTRY_BRIDGE_MAX_LIMIT,
  );

  let exercises = [...snapshot.exercises];
  if (missing) {
    exercises = exercises.filter((exercise) => exercise.missingAssets.includes(missing));
  }
  if (exerciseNumber !== null) {
    exercises = exercises.filter((exercise) => exercise.exerciseNumber === exerciseNumber);
  }
  if (limit !== null) exercises = exercises.slice(0, limit);

  return {
    source: EXERCISE_REGISTRY_BRIDGE_SOURCE,
    schemaVersion: EXERCISE_REGISTRY_BRIDGE_SCHEMA_VERSION,
    readOnly: true,
    ...snapshot,
    exercises,
  };
}

export async function createExerciseRegistryBridgeResponse(
  request: Request,
  loadRegistry: () => Promise<ExerciseRegistry>,
): Promise<Response> {
  try {
    const registry = await loadRegistry();
    const payload = buildExerciseRegistryBridgePayload(registry, new URL(request.url).searchParams);
    return Response.json(payload, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ExerciseRegistryBridgeQueryError) {
      return Response.json(
        { error: "invalid_registry_query" },
        { status: error.statusCode, headers: { "cache-control": "no-store" } },
      );
    }

    console.error("[Viora Registry Bridge] Read failed", {
      event: "exercise_registry_bridge_read_failed",
    });
    return Response.json(
      { error: "exercise_registry_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
