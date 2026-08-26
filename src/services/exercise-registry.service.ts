import { EXERCISE_MEDIA_ROOT } from "../lib/exercise-media.ts";
import {
  loadExerciseRegistryReadModel,
  type ExerciseRegistryReadModel,
} from "../lib/exercise-registry-read-model.ts";
import { ASSETS_BUCKET } from "../lib/media-paths.ts";
import { ServiceError, supabase } from "./base";
import { listMediaTree } from "./media.service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type RegistrySupabaseClient = SupabaseClient<Database>;

async function readSharedExercises(client: RegistrySupabaseClient) {
  const { data, error } = await client
    .from("exercises")
    .select("id,name,owner_id")
    .is("owner_id", null);
  if (error) throw new ServiceError(error.message, error);
  return data ?? [];
}

async function readCanonicalExerciseMedia(client: RegistrySupabaseClient) {
  return listMediaTree(
    {
      bucket: ASSETS_BUCKET,
      prefix: EXERCISE_MEDIA_ROOT,
      maxDepth: 1,
      maxFiles: Number.MAX_SAFE_INTEGER,
      signed: false,
    },
    client,
  );
}

export async function getLiveExerciseRegistryWithClient(
  client: RegistrySupabaseClient,
): Promise<ExerciseRegistryReadModel> {
  return loadExerciseRegistryReadModel({
    readDatabaseExercises: () => readSharedExercises(client),
    readStorageItems: () => readCanonicalExerciseMedia(client),
  });
}

export async function getLiveExerciseRegistry(): Promise<ExerciseRegistryReadModel> {
  return getLiveExerciseRegistryWithClient(supabase);
}

export const exerciseRegistryService = {
  getLive: getLiveExerciseRegistry,
};
