import { createFileRoute } from "@tanstack/react-router";
import { getExerciseRegistry } from "../../lib/exercise-registry-api.ts";
import { createExerciseRegistryBridgeResponse } from "../../lib/exercise-registry-bridge.ts";

async function loadPublicExerciseRegistry() {
  const [{ supabaseAdmin }, { getLiveExerciseRegistryWithClient }] = await Promise.all([
    import("../../integrations/supabase/client.server.ts"),
    import("../../services/exercise-registry.service.ts"),
  ]);
  return getExerciseRegistry(() => getLiveExerciseRegistryWithClient(supabaseAdmin));
}

export const Route = createFileRoute("/api/exercise-registry")({
  server: {
    handlers: {
      GET: ({ request }) =>
        createExerciseRegistryBridgeResponse(request, loadPublicExerciseRegistry),
    },
  },
});
