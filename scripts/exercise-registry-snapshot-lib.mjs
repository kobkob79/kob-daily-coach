export const REGISTRY_SNAPSHOT_SOURCE = "viora-exercise-registry";
export const REGISTRY_SNAPSHOT_SCHEMA_VERSION = 1;

const SNAPSHOT_KEYS = [
  "source",
  "schemaVersion",
  "readOnly",
  "summary",
  "nextRecommendedExercise",
  "exercises",
  "diagnostics",
];
const MISSING_ASSET_ORDER = ["cover", "infographic", "thumbnail", "demo"];

function requireObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Registry response: ${field} must be an object`);
  }
  return value;
}

function requireString(value, field) {
  if (typeof value !== "string") {
    throw new Error(`Invalid Registry response: ${field} must be a string`);
  }
  return value;
}

function requireFiniteNumber(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid Registry response: ${field} must be a finite number`);
  }
  return value;
}

function requireBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid Registry response: ${field} must be a boolean`);
  }
  return value;
}

function normalizeMedia(value, field) {
  const media = requireObject(value, field);
  return {
    hasCover: requireBoolean(media.hasCover, `${field}.hasCover`),
    hasInfographic: requireBoolean(media.hasInfographic, `${field}.hasInfographic`),
    hasThumbnail: requireBoolean(media.hasThumbnail, `${field}.hasThumbnail`),
    hasDemo: requireBoolean(media.hasDemo, `${field}.hasDemo`),
  };
}

function normalizeMissingAssets(value, field) {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid Registry response: ${field} must be an array`);
  }
  const unique = new Set(
    value.map((asset, index) => {
      const normalized = requireString(asset, `${field}[${index}]`);
      if (!MISSING_ASSET_ORDER.includes(normalized)) {
        throw new Error(`Invalid Registry response: unsupported missing asset ${normalized}`);
      }
      return normalized;
    }),
  );
  return MISSING_ASSET_ORDER.filter((asset) => unique.has(asset));
}

function normalizeExercise(value, field) {
  const exercise = requireObject(value, field);
  const normalized = {
    exerciseId: requireString(exercise.exerciseId, `${field}.exerciseId`),
    exerciseNumber: requireFiniteNumber(exercise.exerciseNumber, `${field}.exerciseNumber`),
    canonicalHebrewName: requireString(
      exercise.canonicalHebrewName,
      `${field}.canonicalHebrewName`,
    ),
    englishName: requireString(exercise.englishName, `${field}.englishName`),
    muscleGroup: requireString(exercise.muscleGroup, `${field}.muscleGroup`),
    status: requireString(exercise.status, `${field}.status`),
    media: normalizeMedia(exercise.media, `${field}.media`),
    missingAssets: normalizeMissingAssets(exercise.missingAssets, `${field}.missingAssets`),
  };
  if (exercise.lastUpdated !== undefined && exercise.lastUpdated !== null) {
    normalized.lastUpdated = requireString(exercise.lastUpdated, `${field}.lastUpdated`);
  }
  return normalized;
}

function normalizeSummary(value) {
  const summary = requireObject(value, "summary");
  return {
    totalExercises: requireFiniteNumber(summary.totalExercises, "summary.totalExercises"),
    completedExercises: requireFiniteNumber(
      summary.completedExercises,
      "summary.completedExercises",
    ),
    partialExercises: requireFiniteNumber(summary.partialExercises, "summary.partialExercises"),
    notStartedExercises: requireFiniteNumber(
      summary.notStartedExercises,
      "summary.notStartedExercises",
    ),
    coversComplete: requireFiniteNumber(summary.coversComplete, "summary.coversComplete"),
    infographicsComplete: requireFiniteNumber(
      summary.infographicsComplete,
      "summary.infographicsComplete",
    ),
    thumbnailsComplete: requireFiniteNumber(
      summary.thumbnailsComplete,
      "summary.thumbnailsComplete",
    ),
    demosComplete: requireFiniteNumber(summary.demosComplete, "summary.demosComplete"),
    overallProgressPercent: requireFiniteNumber(
      summary.overallProgressPercent,
      "summary.overallProgressPercent",
    ),
  };
}

function normalizeDiagnostics(value) {
  const diagnostics = requireObject(value, "diagnostics");
  return {
    unresolvedCount: requireFiniteNumber(
      diagnostics.unresolvedCount,
      "diagnostics.unresolvedCount",
    ),
    ignoredDatabaseRows: requireFiniteNumber(
      diagnostics.ignoredDatabaseRows,
      "diagnostics.ignoredDatabaseRows",
    ),
    unassignedMediaPathsCount: requireFiniteNumber(
      diagnostics.unassignedMediaPathsCount,
      "diagnostics.unassignedMediaPathsCount",
    ),
    unexpectedMediaFoldersCount: requireFiniteNumber(
      diagnostics.unexpectedMediaFoldersCount,
      "diagnostics.unexpectedMediaFoldersCount",
    ),
  };
}

export function normalizeExerciseRegistrySnapshot(input) {
  const source = requireObject(input, "response");
  if (!Array.isArray(source.exercises)) {
    throw new Error("Invalid Registry response: exercises must be an array");
  }
  if (source.nextRecommendedExercise !== null && source.nextRecommendedExercise === undefined) {
    throw new Error("Invalid Registry response: nextRecommendedExercise must be an object or null");
  }

  const exercises = source.exercises
    .map((exercise, index) => normalizeExercise(exercise, `exercises[${index}]`))
    .sort(
      (left, right) =>
        left.exerciseNumber - right.exerciseNumber ||
        left.exerciseId.localeCompare(right.exerciseId),
    );

  return {
    source: REGISTRY_SNAPSHOT_SOURCE,
    schemaVersion: REGISTRY_SNAPSHOT_SCHEMA_VERSION,
    readOnly: true,
    summary: normalizeSummary(source.summary),
    nextRecommendedExercise:
      source.nextRecommendedExercise === null
        ? null
        : normalizeExercise(source.nextRecommendedExercise, "nextRecommendedExercise"),
    exercises,
    diagnostics: normalizeDiagnostics(source.diagnostics),
  };
}

export function serializeExerciseRegistrySnapshot(snapshot) {
  return `${JSON.stringify(normalizeExerciseRegistrySnapshot(snapshot), null, 2)}\n`;
}

export function hasMeaningfulSnapshotChange(currentText, nextText) {
  if (currentText === null || currentText === undefined) return true;
  try {
    return serializeExerciseRegistrySnapshot(JSON.parse(currentText)) !== nextText;
  } catch {
    return true;
  }
}

export function validateSnapshotTopLevelKeys(snapshot) {
  return Object.keys(snapshot).every((key, index) => key === SNAPSHOT_KEYS[index]);
}
