import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAdvisorContextSnapshot,
  selectAdvisorContext,
  type AdvisorContextInput,
  type AdvisorContextKey,
  type ContextAdvisorId,
} from "../../advisor-context-snapshot.ts";
import type { AdvisorContextFlag } from "../../advisor-conversations.ts";
import { buildUnifiedTimeline, type UnifiedTimelineInput } from "../../unified-timeline.ts";
import type { BioDaySource } from "../../bio-day.ts";

export interface AdvisorContextSourceData {
  profile: AdvisorContextInput["profile"];
  goals: string[];
  bioDay: AdvisorContextInput["bioDay"];
  shift: AdvisorContextInput["shift"];
  timelineInput: UnifiedTimelineInput;
  conflicts: AdvisorContextKey[];
}

export interface AdvisorContextDataSource {
  load(userId: string, now: Date): Promise<AdvisorContextSourceData>;
}

export interface AdvisorContextBridgeResult {
  context: ReturnType<typeof selectAdvisorContext>;
  contextFlags: AdvisorContextFlag[];
}

export type AdvisorContextMetadataLogger = (details: {
  advisorId: ContextAdvisorId;
  states: Record<string, string>;
  sourceCount: number;
}) => void;

export const logAdvisorContextMetadata: AdvisorContextMetadataLogger = (details) => {
  console.info("[Viora Advisor Context]", {
    event: "advisor_context_built",
    advisor_id: details.advisorId,
    states: details.states,
    source_count: details.sourceCount,
  });
};

function safeFlags(context: ReturnType<typeof selectAdvisorContext>): AdvisorContextFlag[] {
  return Object.entries(context.facts).flatMap(([key, fact]) =>
    fact && fact.state !== "known"
      ? [{ key: key as AdvisorContextFlag["key"], state: fact.state }]
      : [],
  );
}

export async function buildAdvisorContextForUser(
  userId: string,
  advisorId: ContextAdvisorId,
  source: AdvisorContextDataSource,
  now = new Date(),
  logMetadata: AdvisorContextMetadataLogger = logAdvisorContextMetadata,
): Promise<AdvisorContextBridgeResult> {
  const data = await source.load(userId, now);
  const timeline = buildUnifiedTimeline(data.timelineInput);
  const snapshot = buildAdvisorContextSnapshot({
    userId,
    now,
    profile: data.profile,
    goals: data.goals,
    bioDay: data.bioDay,
    shift: data.shift,
    timeline,
    conflicts: data.conflicts,
  });
  const context = selectAdvisorContext(snapshot, advisorId);
  logMetadata({
    advisorId,
    states: Object.fromEntries(
      Object.entries(context.facts).map(([key, value]) => [key, value?.state ?? "missing"]),
    ),
    sourceCount: new Set(Object.values(context.facts).flatMap((value) => value?.sources ?? []))
      .size,
  });
  return { context, contextFlags: safeFlags(context) };
}

function isoDate(value: string, fallback: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

export function createSupabaseAdvisorContextDataSource(
  supabase: SupabaseClient,
): AdvisorContextDataSource {
  return {
    async load(userId, now) {
      const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sinceIso = since.toISOString();
      const sinceDate = sinceIso.slice(0, 10);
      const nowIso = now.toISOString();
      const [
        profileResult,
        goalsResult,
        bioDayResult,
        shiftResult,
        assignmentsResult,
        nutritionResult,
        eventsResult,
        instancesResult,
        sessionsResult,
        workoutsResult,
        healthResult,
      ] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
        supabase
          .from("goals")
          .select("title")
          .eq("user_id", userId)
          .eq("status", "active")
          .limit(10),
        supabase
          .from("bio_days")
          .select("*")
          .eq("user_id", userId)
          .lte("starts_at", nowIso)
          .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
          .order("starts_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("shift_config")
          .select("pattern,updated_at")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("bio_day_event_assignments")
          .select("bio_day_id,source_table,source_record_id")
          .eq("user_id", userId)
          .gte("created_at", sinceIso),
        supabase
          .from("nutrition_entries")
          .select("id,user_id,food_name,created_at,calories,protein_g,carbs_g,fat_g,biological_day")
          .eq("user_id", userId)
          .gte("created_at", sinceIso),
        supabase
          .from("daily_events")
          .select("id,user_id,kind,label,amount,unit,created_at,biological_day")
          .eq("user_id", userId)
          .gte("created_at", sinceIso),
        supabase
          .from("workout_instances")
          .select("id,user_id,display_name,scheduled_date,status,session_id")
          .eq("user_id", userId)
          .gte("scheduled_date", sinceDate),
        supabase
          .from("workout_sessions")
          .select("id,user_id,name,started_at,finished_at,status,instance_id,total_volume_kg")
          .eq("user_id", userId)
          .gte("started_at", sinceIso),
        supabase
          .from("workouts")
          .select("id,user_id,name,date,duration_min")
          .eq("user_id", userId)
          .gte("date", sinceDate),
        supabase
          .from("health_logs")
          .select("id,user_id,date,pain_level,created_at")
          .eq("user_id", userId)
          .gte("date", sinceDate),
      ]);
      const results = [
        profileResult,
        goalsResult,
        bioDayResult,
        shiftResult,
        assignmentsResult,
        nutritionResult,
        eventsResult,
        instancesResult,
        sessionsResult,
        workoutsResult,
        healthResult,
      ];
      if (results.some((result) => result.error)) throw new Error("ADVISOR_CONTEXT_UNAVAILABLE");

      const bio = bioDayResult.data;
      const assignments = new Map(
        (assignmentsResult.data ?? []).map((row) => [
          `${row.source_table}:${row.source_record_id}`,
          row.bio_day_id,
        ]),
      );
      return {
        profile: profileResult.data
          ? {
              displayName: profileResult.data.display_name,
              timezone: bio?.timezone ?? null,
            }
          : null,
        goals: (goalsResult.data ?? []).map((goal) => goal.title),
        bioDay: bio
          ? {
              id: bio.id,
              userId: bio.user_id,
              timezone: bio.timezone,
              startsAt: bio.starts_at,
              endsAt: bio.ends_at,
              localDate: bio.local_date,
              source: bio.source as BioDaySource,
              status: bio.status as "open" | "closed" | "corrected",
              boundaryMetadata: {},
              correctionMetadata: null,
              correctedAt: bio.corrected_at,
              createdAt: bio.created_at,
              updatedAt: bio.updated_at,
            }
          : null,
        shift: shiftResult.data
          ? {
              kind: shiftResult.data.pattern,
              source: "shift_config",
              observedAt: shiftResult.data.updated_at,
            }
          : null,
        timelineInput: {
          timezone: bio?.timezone ?? "UTC",
          bioDayAssignments: assignments,
          nutritionEntries: (nutritionResult.data ?? []).map((row) => ({
            id: row.id,
            userId: row.user_id,
            title: row.food_name,
            occurredAt: row.created_at,
            legacyBiologicalDay: row.biological_day,
            metrics: {
              calories: row.calories,
              proteinG: row.protein_g,
              carbsG: row.carbs_g,
              fatG: row.fat_g,
            },
          })),
          dailyEvents: (eventsResult.data ?? [])
            .filter((row) => ["water", "supplement", "sleep", "weight"].includes(row.kind))
            .map((row) => {
              const metrics: Record<string, string | number | null> =
                row.kind === "water"
                  ? { ml: row.amount }
                  : row.kind === "sleep"
                    ? { hours: row.amount }
                    : { amount: row.amount, unit: row.unit };
              return {
                id: row.id,
                userId: row.user_id,
                type: row.kind as "water" | "supplement" | "sleep" | "weight",
                title: row.label,
                occurredAt: row.created_at,
                legacyBiologicalDay: row.biological_day,
                metrics,
              };
            }),
          workoutInstances: (instancesResult.data ?? []).map((row) => ({
            id: row.id,
            userId: row.user_id,
            name: row.display_name,
            scheduledAt: `${row.scheduled_date}T12:00:00.000Z`,
            status: row.status,
          })),
          workoutSessions: (sessionsResult.data ?? []).map((row) => ({
            id: row.id,
            userId: row.user_id,
            name: row.name,
            occurredAt: row.finished_at ?? row.started_at,
            status: row.status,
            instanceId: row.instance_id,
            metrics: { volumeKg: row.total_volume_kg },
          })),
          legacyWorkouts: (workoutsResult.data ?? []).map((row) => ({
            id: row.id,
            userId: row.user_id,
            name: row.name,
            occurredAt: isoDate(`${row.date}T12:00:00.000Z`, nowIso),
            metrics: { durationMinutes: row.duration_min },
            legacy: true,
          })),
          healthLogs: (healthResult.data ?? []).map((row) => ({
            id: row.id,
            userId: row.user_id,
            occurredAt: row.created_at,
            severity: row.pain_level,
          })),
        },
        conflicts: [],
      };
    },
  };
}
