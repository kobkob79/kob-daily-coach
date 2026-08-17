import { EXERCISE_MEDIA_ROOT } from "@/lib/exercise-media";

export type ExerciseAssignRole = "thumbnail" | "main" | "guide" | "demo";
export const EXERCISE_ASSIGN_ROLE_LABEL: Record<ExerciseAssignRole, string> = {
  thumbnail: "תמונה ממוזערת",
  main: "תמונה ראשית",
  guide: "מדריך מלא",
  demo: "סרטון הדגמה",
};

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