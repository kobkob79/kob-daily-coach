export const AVATAR_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const AVATAR_RAW_MAX_BYTES = 10 * 1024 * 1024;
export const AVATAR_STORED_MAX_BYTES = 1024 * 1024;

export type AvatarUploadStage = "processing" | "uploading";
export type AvatarSafeLogEvent =
  | "profile_avatar_rollback_delete_failed"
  | "profile_avatar_old_object_delete_failed"
  | "profile_avatar_removed_object_delete_failed"
  | "profile_avatar_unsafe_stored_path";

export interface AvatarFlowDependencies {
  processImage(file: File): Promise<File>;
  upload(path: string, file: File): Promise<void>;
  updateProfile(path: string | null): Promise<void>;
  remove(path: string): Promise<void>;
  createObjectId(): string;
  onStage?(stage: AvatarUploadStage): void;
  log?(event: AvatarSafeLogEvent): void;
}

function isAllowedMimeType(type: string): boolean {
  return AVATAR_ALLOWED_MIME_TYPES.includes(type as (typeof AVATAR_ALLOWED_MIME_TYPES)[number]);
}

export function validateAvatarFile(file: File): void {
  if (!isAllowedMimeType(file.type)) {
    throw new Error("אפשר להעלות תמונת JPEG, PNG או WebP בלבד");
  }

  if (file.size > AVATAR_RAW_MAX_BYTES) {
    throw new Error("התמונה גדולה מדי. אפשר להעלות תמונה עד 10MB");
  }
}

function extensionForMimeType(type: string): "jpg" | "webp" {
  return type === "image/webp" ? "webp" : "jpg";
}

function isOwnedPath(path: string, userId: string): boolean {
  return path.startsWith(`${userId}/`);
}

export async function replaceProfileAvatar(
  file: File,
  currentPath: string | null,
  userId: string,
  dependencies: AvatarFlowDependencies,
): Promise<string> {
  validateAvatarFile(file);
  dependencies.onStage?.("processing");

  const processedFile = await dependencies.processImage(file);
  if (!isAllowedMimeType(processedFile.type) || processedFile.size > AVATAR_STORED_MAX_BYTES) {
    throw new Error("לא הצלחנו להכין תמונת פרופיל קטנה מספיק. נסו תמונה אחרת");
  }

  const extension = extensionForMimeType(processedFile.type);
  const newPath = `${userId}/${dependencies.createObjectId()}.${extension}`;

  dependencies.onStage?.("uploading");
  await dependencies.upload(newPath, processedFile);

  try {
    await dependencies.updateProfile(newPath);
  } catch (error) {
    try {
      await dependencies.remove(newPath);
    } catch {
      dependencies.log?.("profile_avatar_rollback_delete_failed");
    }
    throw error;
  }

  if (currentPath && currentPath !== newPath) {
    if (!isOwnedPath(currentPath, userId)) {
      dependencies.log?.("profile_avatar_unsafe_stored_path");
    } else {
      try {
        await dependencies.remove(currentPath);
      } catch {
        dependencies.log?.("profile_avatar_old_object_delete_failed");
      }
    }
  }

  return newPath;
}

export async function removeProfileAvatar(
  currentPath: string | null,
  userId: string,
  dependencies: Pick<AvatarFlowDependencies, "updateProfile" | "remove" | "log">,
): Promise<void> {
  await dependencies.updateProfile(null);

  if (!currentPath) return;
  if (!isOwnedPath(currentPath, userId)) {
    dependencies.log?.("profile_avatar_unsafe_stored_path");
    return;
  }

  try {
    await dependencies.remove(currentPath);
  } catch {
    dependencies.log?.("profile_avatar_removed_object_delete_failed");
  }
}
