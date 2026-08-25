import { EXERCISE_MEDIA_ROOT } from "../lib/exercise-media.ts";
import {
  loadExerciseRegistryReadModel,
  type ExerciseRegistryReadModel,
} from "../lib/exercise-registry-read-model.ts";
import { ASSETS_BUCKET } from "../lib/media-paths.ts";
import { ServiceError, supabase } from "./base";
import { listMediaTree } from "./media.service";

async function readSharedExercises() {
  const { data, error } = await supabase
    .from("exercises")
    .select("id,name,owner_id")
    .is("owner_id", null);
  if (error) throw new ServiceError(error.message, error);
  return data ?? [];
}

async function readCanonicalExerciseMedia() {
  return listMediaTree({
    bucket: ASSETS_BUCKET,
    prefix: EXERCISE_MEDIA_ROOT,
    maxDepth: 1,
    maxFiles: Number.MAX_SAFE_INTEGER,
    signed: false,
  });
}

export async function getLiveExerciseRegistry(): Promise<ExerciseRegistryReadModel> {
  return loadExerciseRegistryReadModel({
    readDatabaseExercises: readSharedExercises,
    readStorageItems: readCanonicalExerciseMedia,
  });
}

export const exerciseRegistryService = {
  getLive: getLiveExerciseRegistry,
};
