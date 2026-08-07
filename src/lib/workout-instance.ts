/**
 * Workout Instance domain layer (VIORA-WORKOUT-INTEGRATION-001, credit 2).
 *
 * A WorkoutInstance is the missing persisted primitive: "a specific workout
 * planned for a specific date". It is the single source of truth between the
 * recurring planning layer (`workout_plans`) and the execution layer
 * (`workout_sessions` / `workout_sets`).
 *
 *   WorkoutTemplate -> WorkoutPlanSlot -> WorkoutInstance -> WorkoutSession -> WorkoutSets
 *
 * Rules encoded here (locked product rules):
 *  - `overdue` is DERIVED (`planned` + scheduled_date in the past). It is never
 *    persisted and never silently converted to `skipped`.
 *  - `skipped` only happens through an explicit user action (`skipInstance`).
 *  - `scheduled_date` is never rewritten when an overdue workout is performed
 *    later; the actual execution timestamps live on the session.
 *  - Several instances may exist on the same calendar date. Uniqueness is per
 *    (user, date, plan_weekday) so recurring slots stay idempotent while
 *    ad-hoc instances (plan_weekday = null) are unlimited.
 *  - Editing an unstarted planned instance updates it in place instead of
 *    creating a duplicate.
 *  - Once a session is linked (status `active`), planning edits never touch it.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Row } from "@/types/database";

export type InstanceStatus = "planned" | "active" | "partial" | "completed" | "skipped";

export type WorkoutInstance = Row<"workout_instances"> & { status: InstanceStatus };

/** Derived product state — never persisted. */
export type InstanceViewState = InstanceStatus | "overdue";

export interface PlanIntentSlot {
  weekday: number;
  template_id: string | null;
  display_name: string | null;
}

/* --------------------------- date helpers --------------------------- */

/** Local-time `YYYY-MM-DD` (never UTC — scheduling is a calendar concept). */
export function dateKey(d: Date = new Date()): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function startOfWeek(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function weekDates(weekStart: Date = startOfWeek()): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/* --------------------------- derived state --------------------------- */

export function isOverdue(inst: WorkoutInstance, today: string = dateKey()): boolean {
  return inst.status === "planned" && inst.scheduled_date < today;
}

/** Resolves the state a screen should render, including derived `overdue`. */
export function viewState(inst: WorkoutInstance, today: string = dateKey()): InstanceViewState {
  if (isOverdue(inst, today)) return "overdue";
  return inst.status;
}

/** A partial instance is still actionable, exactly like a planned one. */
export function isActionable(inst: WorkoutInstance): boolean {
  return inst.status === "planned" || inst.status === "partial" || inst.status === "active";
}

/* --------------------------- reads --------------------------- */

async function requireUser(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export async function listInstances(from: string, to: string): Promise<WorkoutInstance[]> {
  const { data, error } = await supabase
    .from("workout_instances")
    .select("*")
    .gte("scheduled_date", from)
    .lte("scheduled_date", to)
    .order("scheduled_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WorkoutInstance[];
}

export async function listWeekInstances(
  weekStart: Date = startOfWeek(),
): Promise<WorkoutInstance[]> {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return listInstances(dateKey(weekStart), dateKey(end));
}

/** Planned/partial instances still open on or before `through` (overdue included). */
export async function listOpenInstances(
  through: string = dateKey(),
  lookbackDays = 28,
): Promise<WorkoutInstance[]> {
  const from = new Date(`${through}T00:00:00`);
  from.setDate(from.getDate() - lookbackDays);
  const all = await listInstances(dateKey(from), through);
  return all.filter((i) => i.status === "planned" || i.status === "partial");
}

export async function getInstance(id: string): Promise<WorkoutInstance | null> {
  const { data, error } = await supabase
    .from("workout_instances")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkoutInstance) ?? null;
}

export async function getInstanceBySession(sessionId: string): Promise<WorkoutInstance | null> {
  const { data, error } = await supabase
    .from("workout_instances")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return (data as WorkoutInstance) ?? null;
}

/* --------------------------- creation / ensure --------------------------- */

/**
 * Materialise the recurring plan intent for one date. Idempotent: the
 * (user, date, plan_weekday) unique index makes repeated calls a no-op, and an
 * existing instance that has NOT started yet is updated to the current plan
 * intent instead of being duplicated.
 */
export async function ensureInstanceForSlot(
  slot: PlanIntentSlot,
  date: Date,
): Promise<WorkoutInstance | null> {
  if (!slot.template_id) return null;
  const user_id = await requireUser();
  const scheduled_date = dateKey(date);

  const { data: existing, error: readErr } = await supabase
    .from("workout_instances")
    .select("*")
    .eq("scheduled_date", scheduled_date)
    .eq("plan_weekday", slot.weekday)
    .maybeSingle();
  if (readErr) throw readErr;

  if (existing) {
    const inst = existing as WorkoutInstance;
    // Never touch an instance that already entered execution.
    if (inst.status !== "planned") return inst;
    if (inst.template_id === slot.template_id && inst.display_name === slot.display_name) {
      return inst;
    }
    return updatePlannedInstance(inst.id, {
      templateId: slot.template_id,
      displayName: slot.display_name,
    });
  }

  const { data, error } = await supabase
    .from("workout_instances")
    .insert({
      user_id,
      scheduled_date,
      template_id: slot.template_id,
      plan_weekday: slot.weekday,
      display_name: slot.display_name,
      status: "planned",
    })
    .select("*")
    .single();
  if (error) {
    // Lost a race against the unique index — read the winner back.
    const again = await supabase
      .from("workout_instances")
      .select("*")
      .eq("scheduled_date", scheduled_date)
      .eq("plan_weekday", slot.weekday)
      .maybeSingle();
    if (again.data) return again.data as WorkoutInstance;
    throw error;
  }
  return data as WorkoutInstance;
}

/** Lazily materialise a whole visible week from plan slots. */
export async function ensureWeekInstances(
  slots: PlanIntentSlot[],
  weekStart: Date = startOfWeek(),
): Promise<WorkoutInstance[]> {
  const dates = weekDates(weekStart);
  for (const slot of slots) {
    if (!slot.template_id) continue;
    const date = dates[slot.weekday];
    if (!date) continue;
    await ensureInstanceForSlot(slot, date);
  }
  return listWeekInstances(weekStart);
}

/** Ad-hoc instance (second workout on the same day, unplanned training, …). */
export async function createAdhocInstance(input: {
  scheduledDate?: string;
  templateId: string | null;
  displayName?: string | null;
}): Promise<WorkoutInstance> {
  const user_id = await requireUser();
  const { data, error } = await supabase
    .from("workout_instances")
    .insert({
      user_id,
      scheduled_date: input.scheduledDate ?? dateKey(),
      template_id: input.templateId,
      plan_weekday: null,
      display_name: input.displayName ?? null,
      status: "planned",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkoutInstance;
}

/* --------------------------- planning edits --------------------------- */

/**
 * Edit an instance that has not started yet. Returns the instance unchanged
 * when execution already began (active session protection).
 */
export async function updatePlannedInstance(
  id: string,
  patch: { templateId?: string | null; displayName?: string | null; scheduledDate?: string },
): Promise<WorkoutInstance> {
  const current = await getInstance(id);
  if (!current) throw new Error("INSTANCE_NOT_FOUND");
  if (current.status !== "planned") return current;
  const { data, error } = await supabase
    .from("workout_instances")
    .update({
      ...(patch.templateId !== undefined ? { template_id: patch.templateId } : {}),
      ...(patch.displayName !== undefined ? { display_name: patch.displayName } : {}),
      ...(patch.scheduledDate !== undefined ? { scheduled_date: patch.scheduledDate } : {}),
    })
    .eq("id", id)
    .eq("status", "planned")
    .select("*")
    .single();
  if (error) throw error;
  return data as WorkoutInstance;
}

/**
 * Re-point today's and future not-yet-started instances of a weekday slot at
 * the new plan intent. Past instances keep their historical intent, and any
 * instance already linked to a session is left alone.
 */
export async function syncSlotPlanning(
  weekday: number,
  templateId: string | null,
  displayName: string | null,
): Promise<void> {
  const today = dateKey();
  const { data, error } = await supabase
    .from("workout_instances")
    .select("id")
    .eq("plan_weekday", weekday)
    .eq("status", "planned")
    .is("session_id", null)
    .gte("scheduled_date", today);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id);
  if (!ids.length) return;
  if (!templateId) {
    // Slot cleared (rest / empty day): drop the untouched planned occurrences.
    const del = await supabase.from("workout_instances").delete().in("id", ids);
    if (del.error) throw del.error;
    return;
  }
  const upd = await supabase
    .from("workout_instances")
    .update({ template_id: templateId, display_name: displayName })
    .in("id", ids);
  if (upd.error) throw upd.error;
}

/* --------------------------- lifecycle --------------------------- */

/** Link an execution session to its instance and mark it active. */
export async function linkSessionToInstance(
  instanceId: string,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("workout_instances")
    .update({ session_id: sessionId, status: "active" })
    .eq("id", instanceId);
  if (error) throw error;
  const link = await supabase
    .from("workout_sessions")
    .update({ instance_id: instanceId })
    .eq("id", sessionId);
  if (link.error) throw link.error;
}

/**
 * Resolve which instance a starting session belongs to, creating one when the
 * plan intent has not been materialised yet. `scheduledDate` stays the ORIGINAL
 * planned date — performing an overdue workout never rewrites it.
 */
export async function resolveInstanceForStart(input: {
  templateId: string;
  displayName: string | null;
  planWeekday?: number | null;
  scheduledDate?: string;
}): Promise<WorkoutInstance> {
  const today = dateKey();

  if (input.planWeekday != null) {
    // Prefer an already-open (planned/partial) occurrence of that slot: today's
    // first, otherwise the oldest overdue one — never a future date.
    const open = (await listOpenInstances(today)).filter(
      (i) => i.plan_weekday === input.planWeekday,
    );
    const sameDay = open.find((i) => i.scheduled_date === today);
    const chosen = sameDay ?? open[0];
    if (chosen) return chosen;

    const dates = weekDates();
    const date = dates[input.planWeekday] ?? new Date();
    const ensured = await ensureInstanceForSlot(
      {
        weekday: input.planWeekday,
        template_id: input.templateId,
        display_name: input.displayName,
      },
      date,
    );
    if (ensured && ensured.status === "planned") return ensured;
    // Slot occupied by a finished instance (second workout on the same slot):
    // fall through to an ad-hoc instance so history is never overwritten.
  }

  return createAdhocInstance({
    scheduledDate: input.scheduledDate ?? today,
    templateId: input.templateId,
    displayName: input.displayName,
  });
}

export async function completeInstanceForSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("workout_instances")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("session_id", sessionId);
  if (error) throw error;
}

/**
 * Execution stopped without finishing. The instance stays actionable:
 * `partial` when work was logged, back to `planned` otherwise. The session
 * link is released so a later resume can attach a fresh session to the SAME
 * logical instance (the abandoned session keeps its `instance_id` for history).
 */
export async function releaseInstanceForSession(
  sessionId: string,
  hadProgress: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("workout_instances")
    .update({ status: hadProgress ? "partial" : "planned", session_id: null })
    .eq("session_id", sessionId);
  if (error) throw error;
}

/** Explicit user action — the only path into `skipped`. */
export async function skipInstance(id: string, notes?: string | null): Promise<void> {
  const { error } = await supabase
    .from("workout_instances")
    .update({
      status: "skipped",
      skipped_at: new Date().toISOString(),
      ...(notes !== undefined ? { notes } : {}),
    })
    .eq("id", id)
    .in("status", ["planned", "partial"]);
  if (error) throw error;
}

/** Undo an explicit skip (planning-only, never touches execution data). */
export async function unskipInstance(id: string): Promise<void> {
  const { error } = await supabase
    .from("workout_instances")
    .update({ status: "planned", skipped_at: null })
    .eq("id", id)
    .eq("status", "skipped");
  if (error) throw error;
}
