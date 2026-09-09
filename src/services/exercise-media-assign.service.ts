import { EXERCISE_MEDIA_ROOT } from "@/lib/exercise-media";

export type ExerciseAssignRole = "thumbnail" | "main" | "guide" | "demo";
export const EXERCISE_ASSIGN_ROLE_LABEL: Record<ExerciseAssignRole, string> = {
  thumbnail: "תמונה ממוזערת",
  main: "תמונה ראשית / תמונת קאבר",
  guide: "מדריך מלא",
  demo: "סרטון הדגמה",
};

/**
 * Which user-facing surfaces a given role's assignment definitely updates,
 * per the shared resolver policy in exercise-media.ts
 * (`active_workout`/`exercise_details` = demo → main → thumbnail;
 * `thumbnail` slot = thumbnail → main). Shown after a successful assignment
 * so the admin never has to guess - and specifically so assigning a demo
 * video is never mistaken for having also replaced the library thumbnail.
 */
export const EXERCISE_ASSIGN_ROLE_AFFECTED_VIEWS: Record<ExerciseAssignRole, string[]> = {
  demo: ["אימון פעיל", "פרטי התרגיל"],
  main: ["פרטי התרגיל", "אימון פעיל (כשלא הוגדר סרטון הדגמה)"],
  thumbnail: ["כרטיס המאגר"],
  guide: ["מדריך מלא בפרטי התרגיל"],
};

/** Shown before confirming a `demo` assignment, so expectations are set up front. */
export const EXERCISE_ASSIGN_DEMO_EXPLANATION =
  "הסרטון יוצג בפרטי התרגיל ובאימון. כרטיס המאגר משתמש בתמונה ממוזערת.";

function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

export function destinationPath(
  exerciseId: string,
  role: ExerciseAssignRole,
  sourcePath: string,
): string {
  const ext = extensionOf(sourcePath) || (role === "demo" ? "mp4" : "jpg");
  return `${EXERCISE_MEDIA_ROOT}/${exerciseId}/${role}.${ext}`;
}
