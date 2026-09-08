/**
 * Server-only implementation of Workout Result publishing.
 * Dynamically imported from community-workout-share.functions.ts so
 * server-only code paths never enter the client bundle.
 *
 * Every query is explicitly scoped to `userId` (belt-and-suspenders on top
 * of RLS, same pattern as advisor-context-consent.functions.ts) — a
 * session/set row that isn't the caller's own is invisible here, which is
 * how "a user cannot publish another user's workout" and "foreign session
 * ids rejected" are actually enforced, not just documented.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildWorkoutSharePayload, type WorkoutSharePayload } from "./community-workout-share.ts";
import type {
  ExistingWorkoutShareResult,
  PublishWorkoutShareInput,
  PublishWorkoutShareResult,
} from "./community-workout-share.functions";

interface WorkoutSessionRow {
  id: string;
  name: string | null;
  started_at: string;
  duration_seconds: number | null;
  status: string;
}

interface WorkoutSetRow {
  exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  is_warmup: boolean;
  completed_at: string | null;
}

interface ExerciseRow {
  id: string;
  name: string;
  muscle_group: string | null;
}

// workout_sessions/workout_sets/exercises are not yet re-emitted into
// src/integrations/supabase/types.ts (same gap workout-session.ts's own
// header comment documents) — cast through `any` for these three tables
// only, matching that file's established convention, rather than
// hand-typing a parallel Database shape here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const UNIQUE_VIOLATION = "23505";

async function loadSession(
  client: AnyClient,
  userId: string,
  sessionId: string,
): Promise<WorkoutSessionRow | null> {
  const { data, error } = await client
    .from("workout_sessions")
    .select("id,name,started_at,duration_seconds,status")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkoutSessionRow) ?? null;
}

async function loadSets(
  client: AnyClient,
  userId: string,
  sessionId: string,
): Promise<WorkoutSetRow[]> {
  const { data, error } = await client
    .from("workout_sets")
    .select("exercise_id,set_number,weight_kg,reps,is_warmup,completed_at")
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WorkoutSetRow[];
}

async function loadExercises(
  client: AnyClient,
  exerciseIds: string[],
): Promise<Map<string, { name: string; muscle_group: string | null }>> {
  if (exerciseIds.length === 0) return new Map();
  const { data, error } = await client
    .from("exercises")
    .select("id,name,muscle_group")
    .in("id", exerciseIds);
  if (error) throw error;
  const map = new Map<string, { name: string; muscle_group: string | null }>();
  for (const row of (data ?? []) as ExerciseRow[]) {
    map.set(row.id, { name: row.name, muscle_group: row.muscle_group });
  }
  return map;
}

async function loadAuthorDisplayName(client: SupabaseClient, userId: string): Promise<string> {
  const { data } = await client
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  return (data as { display_name: string | null } | null)?.display_name?.trim() || "משתמש";
}

async function buildPayloadForSession(
  client: AnyClient,
  userId: string,
  sessionId: string,
  input: PublishWorkoutShareInput,
): Promise<{ session: WorkoutSessionRow; payload: WorkoutSharePayload } | null> {
  const session = await loadSession(client, userId, sessionId);
  if (!session) return null;

  const sets = await loadSets(client, userId, sessionId);
  const exercisesById = await loadExercises(client, [...new Set(sets.map((s) => s.exercise_id))]);

  const payload = buildWorkoutSharePayload({
    session,
    sets,
    exercisesById,
    caption: input.caption,
    locationLabel: input.locationLabel,
    coach: input.includeCoach ? input.coach : null,
  });
  return { session, payload };
}

async function findExistingPost(
  client: AnyClient,
  userId: string,
  sessionId: string,
): Promise<{ id: string; payload: WorkoutSharePayload } | null> {
  const { data, error } = await client
    .from("community_posts")
    .select("id,payload")
    .eq("user_id", userId)
    .eq("source_type", "workout")
    .eq("source_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id as string, payload: data.payload as WorkoutSharePayload };
}

export async function findExistingWorkoutShareResult(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<ExistingWorkoutShareResult> {
  const existing = await findExistingPost(client as AnyClient, userId, sessionId);
  return existing
    ? { status: "found", postId: existing.id, payload: existing.payload }
    : { status: "not_found" };
}

export async function publishWorkoutShareResult(
  client: SupabaseClient,
  userId: string,
  input: PublishWorkoutShareInput,
): Promise<PublishWorkoutShareResult> {
  const anyClient = client as AnyClient;

  let built;
  try {
    built = await buildPayloadForSession(anyClient, userId, input.sessionId, input);
  } catch {
    return { status: "error", reason: "PERSISTENCE_UNAVAILABLE" };
  }
  if (!built) return { status: "error", reason: "SESSION_NOT_FOUND" };
  if (built.session.status !== "completed") {
    return { status: "error", reason: "SESSION_NOT_COMPLETED" };
  }

  const authorDisplayName = await loadAuthorDisplayName(client, userId).catch(() => "משתמש");

  const { data, error } = await anyClient
    .from("community_posts")
    .insert({
      user_id: userId,
      author_display_name: authorDisplayName,
      author_avatar_path: null,
      body: "",
      photo_path: input.photoPath,
      post_type: "workout_result",
      payload: built.payload,
      source_type: "workout",
      source_id: input.sessionId,
      audience: input.audience,
      location_label: built.payload.locationLabel,
    })
    .select("id")
    .single();

  if (error) {
    // Unique violation on (user_id, source_type, source_id) means this
    // exact session was already published — by a genuinely concurrent
    // request, a retried request, or a double tap that both reached the
    // server. Resolve to the existing post rather than erroring: the
    // uniqueness guarantee is the point, not a failure.
    if (error.code === UNIQUE_VIOLATION) {
      const existing = await findExistingPost(anyClient, userId, input.sessionId);
      if (existing) {
        return { status: "already_shared", postId: existing.id, payload: existing.payload };
      }
    }
    return { status: "error", reason: "PERSISTENCE_UNAVAILABLE" };
  }

  return { status: "published", postId: (data as { id: string }).id, payload: built.payload };
}
