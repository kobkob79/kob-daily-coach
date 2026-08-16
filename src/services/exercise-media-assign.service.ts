/**
 * Assign a Media Inbox file to an exercise as a canonical media role.
 *
 * Phase 1 roles: thumbnail / main image / demo video. Destination is always
 * `exercise-assets/exercises/<exercise-id>/<role>.<ext>` so the existing
 * Storage-discovery resolver picks it up with no schema at all.
 */
import { supabase } from "./base";
import { ASSETS_BUCKET } from "@/lib/media-paths";
import { EXERCISE_MEDIA_ROOT } from "@/lib/exercise-media";
import { MEDIA_INBOX_BUCKET } from "./media-inbox.service";

export type ExerciseAssignRole = "thumbnail" | "main" | "demo";

export const EXERCISE_ASSIGN_ROLE_LABEL: Record<ExerciseAssignRole, string> = {
  thumbnail: "תמונה ממוזערת",
  main: "תמונה ראשית",
  demo: "סרטון הדגמה",
};

function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

export function exerciseFolder(exerciseId: string): string {
  return `${EXERCISE_MEDIA_ROOT}/${exerciseId}`;
}

export function destinationPath(
  exerciseId: string,
  role: ExerciseAssignRole,
  sourcePath: string,
): string {
  const ext = extensionOf(sourcePath) || (role === "demo" ? "mp4" : "jpg");
  return `${exerciseFolder(exerciseId)}/${role}.${ext}`;
}

/** Existing object path for that role, or null when the role is free. */
export async function findExistingRoleMedia(
  exerciseId: string,
  role: ExerciseAssignRole,
): Promise<string | null> {
  const folder = exerciseFolder(exerciseId);
  const { data, error } = await supabase.storage.from(ASSETS_BUCKET).list(folder, {
    limit: 100,
  });
  if (error) return null;
  const hit = (data ?? []).find((f) => f.name.toLowerCase().startsWith(`${role}.`));
  return hit ? `${folder}/${hit.name}` : null;
}

export interface AssignResult {
  path: string;
  replaced: string | null;
}

/**
 * Copies the inbox object into the exercise folder under the canonical name.
 * The original inbox file is intentionally left in place.
 */
export async function assignInboxMediaToExercise(params: {
  inboxPath: string;
  exerciseId: string;
  role: ExerciseAssignRole;
  /** Pass true only after the user confirmed replacing existing media. */
  allowReplace?: boolean;
}): Promise<AssignResult> {
  const { inboxPath, exerciseId, role, allowReplace = false } = params;

  const existing = await findExistingRoleMedia(exerciseId, role);
  if (existing && !allowReplace) {
    throw new Error("EXISTING_ROLE_MEDIA");
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(MEDIA_INBOX_BUCKET)
    .download(inboxPath);
  if (downloadError || !blob) {
    throw downloadError ?? new Error("לא הצלחנו לקרוא את הקובץ מה-Inbox");
  }

  const target = destinationPath(exerciseId, role, inboxPath);

  const { error: uploadError } = await supabase.storage
    .from(ASSETS_BUCKET)
    .upload(target, blob, {
      upsert: true,
      contentType: blob.type || "application/octet-stream",
    });
  if (uploadError) throw uploadError;

  // A different extension for the same role would leave a stale sibling behind.
  if (existing && existing !== target) {
    await supabase.storage.from(ASSETS_BUCKET).remove([existing]);
  }

  return { path: target, replaced: existing };
}
