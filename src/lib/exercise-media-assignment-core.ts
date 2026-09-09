/**
 * Exercise Media assignment — pure, dependency-injected orchestration.
 *
 * VIORA-EXERCISE-MEDIA-CROSS-SURFACE-SYNC-001, findings F3/F4/F5/F6.
 *
 * Same rationale and shape as exercise-motion-draft-core.ts: all input
 * validation and write-ordering/compensation decisions live here as a pure
 * function over an injected `AssignmentDeps` interface, so they are fully
 * unit-testable (exercise-media-assignment-core.test.ts) with a fake
 * Storage client, without a real Supabase connection. The only caller that
 * supplies the real, service-role-backed implementation is
 * exercise-media-assignment.functions.ts's server function handler -
 * nothing here imports Supabase, TanStack Start, or any admin-auth code.
 *
 * F4 (safe errors): every outcome here is a typed result, never a thrown
 * raw Storage/Postgres error. `exercise-media-assignment.functions.ts` is
 * responsible for turning a `*_failed` outcome into a safe, allowlisted
 * category plus a correlation id for its own logs - this module never
 * decides what reaches the client, only what happened.
 */

export type AssignmentRole = "thumbnail" | "main" | "guide" | "demo";

const ASSIGNMENT_ROLES: readonly AssignmentRole[] = ["thumbnail", "main", "guide", "demo"];

/**
 * Narrower, deliberately independent of media.service.ts's generic
 * classifier allowlist (which also accepts `svg` for other asset
 * categories) - this is a security-sensitive Admin upload path, so the
 * allowlist here stays intentionally minimal rather than inheriting a
 * broader list meant for a different surface.
 */
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "heic"] as const;
const VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Storage-safe relative path: no traversal segments, no empty segments, no
 * control characters, and (checked separately by the caller against the
 * actual authenticated user id) must live under a `<userId>/` prefix.
 * Deliberately conservative - this gates what can ever reach a
 * Storage.download() call.
 */
const SAFE_RELATIVE_PATH_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

export interface AssignmentInput {
  sourcePath: string;
  exerciseId: string;
  role: AssignmentRole;
  replace: boolean;
}

export type ValidateAssignmentInputResult =
  { ok: true; data: AssignmentInput } | { ok: false; reason: string };

function extensionOf(path: string): string {
  const fileName = path.split("/").pop() ?? "";
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/**
 * Strict schema validation (F5): rejects anything that isn't exactly the
 * expected shape, before any Storage operation is even attempted.
 *
 * In particular, `replace` must be a genuine boolean - the previous
 * `Boolean(i.replace)` coercion turned the *string* `"false"` into `true`
 * (any non-empty string is JS-truthy), which meant a crafted request could
 * force the destructive replace path regardless of what the client UI
 * actually sent. Here, anything other than a real `true`/`false` (or
 * `undefined`, defaulting to `false`) is rejected outright as invalid
 * input, not silently coerced.
 */
export function validateAssignmentInput(input: unknown): ValidateAssignmentInputResult {
  const i = (input ?? {}) as Record<string, unknown>;

  const sourcePath = i.sourcePath;
  const exerciseId = i.exerciseId;
  const role = i.role;
  const replace = i.replace;

  if (typeof sourcePath !== "string" || sourcePath.length === 0) {
    return { ok: false, reason: "missing_source_path" };
  }
  if (!SAFE_RELATIVE_PATH_RE.test(sourcePath) || sourcePath.includes("..")) {
    return { ok: false, reason: "unsafe_source_path" };
  }

  if (typeof exerciseId !== "string" || !UUID_RE.test(exerciseId)) {
    return { ok: false, reason: "invalid_exercise_id" };
  }

  if (typeof role !== "string" || !ASSIGNMENT_ROLES.includes(role as AssignmentRole)) {
    return { ok: false, reason: "invalid_role" };
  }

  if (replace !== undefined && typeof replace !== "boolean") {
    return { ok: false, reason: "invalid_replace_flag" };
  }

  const extension = extensionOf(sourcePath);
  if (!extension) {
    return { ok: false, reason: "missing_extension" };
  }

  const isVideoRole = role === "demo";
  const allowedExtensions: readonly string[] = isVideoRole ? VIDEO_EXTENSIONS : IMAGE_EXTENSIONS;
  if (!allowedExtensions.includes(extension)) {
    return { ok: false, reason: isVideoRole ? "extension_not_video" : "extension_not_image" };
  }

  return {
    ok: true,
    data: {
      sourcePath,
      exerciseId,
      role: role as AssignmentRole,
      replace: replace === true,
    },
  };
}

/**
 * Detected-at-download-time defense in depth: the extension check above
 * only looks at the *claimed* filename. Once the actual bytes are
 * downloaded, the Storage-reported MIME type must also agree with the
 * role's media kind - an attacker who renames a non-video file to
 * `demo.mp4` (passing the extension check) still cannot get it uploaded to
 * a `demo` role slot once the real content-type is known.
 */
export function mimeTypeMatchesRole(role: AssignmentRole, mimeType: string | null): boolean {
  if (!mimeType) return false;
  return role === "demo" ? mimeType.startsWith("video/") : mimeType.startsWith("image/");
}

export interface StorageFile {
  name: string;
}

export type DownloadResult =
  { found: true; bytes: Uint8Array; contentType: string | null } | { found: false };

export type StorageOpResult = { ok: true } | { ok: false };

export interface AssignmentDeps {
  /** Downloads the source object from the Media Inbox bucket. */
  downloadSource(sourcePath: string): Promise<DownloadResult>;
  /** Lists every object directly under `exercises/<exerciseId>/`. */
  listExerciseFolder(exerciseId: string): Promise<StorageFile[] | { failed: true }>;
  /** Uploads to the canonical `<role>.<ext>` destination, overwriting in place if it already exists. */
  upload(
    destinationPath: string,
    bytes: Uint8Array,
    contentType: string | undefined,
  ): Promise<StorageOpResult>;
  /** Removes a batch of paths. Must be safe to call again on paths that no longer exist (idempotent). */
  remove(paths: string[]): Promise<StorageOpResult>;
}

export type AssignmentResult =
  | { status: "invalid"; reason: string }
  | { status: "forbidden" }
  | { status: "not_found" }
  | { status: "list_failed" }
  | { status: "exists"; existingPath: string }
  | { status: "upload_failed" }
  | { status: "assigned"; destinationPath: string }
  | {
      status: "assigned_with_cleanup_warning";
      destinationPath: string;
      staleSiblingPaths: string[];
    };

/** How many times cleanup is attempted (the first try plus this many retries) before reporting a warning instead of a full success. */
const CLEANUP_MAX_ATTEMPTS = 3;

async function removeWithRetry(
  deps: AssignmentDeps,
  paths: string[],
  maxAttempts: number = CLEANUP_MAX_ATTEMPTS,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Idempotent by construction: `remove()` on a path that is already gone
    // (e.g. a prior attempt actually succeeded but the response was lost)
    // must still report success, never error - real Supabase Storage
    // `.remove()` already behaves this way (removing a nonexistent object
    // is not itself an error).
    const result = await deps.remove(paths);
    if (result.ok) return true;
  }
  return false;
}

/**
 * The full validate → forbid-check → download → list → (exists?) → upload
 * → cleanup pipeline for one role assignment. See the module doc for why
 * this is dependency-injected and what F3/F4/F5/F6 each require of it.
 */
export async function performExerciseMediaAssignment(
  deps: AssignmentDeps,
  rawInput: unknown,
  actorUserId: string,
): Promise<AssignmentResult> {
  const validated = validateAssignmentInput(rawInput);
  if (!validated.ok) {
    return { status: "invalid", reason: validated.reason };
  }
  const { sourcePath, exerciseId, role, replace } = validated.data;

  // Ownership: the Media Inbox source object must belong to the calling
  // (already-Admin-verified) user.
  if (!sourcePath.startsWith(`${actorUserId}/`)) {
    return { status: "forbidden" };
  }

  const download = await deps.downloadSource(sourcePath);
  if (!download.found) {
    return { status: "not_found" };
  }

  // Defense in depth against a renamed-extension attack - see
  // mimeTypeMatchesRole()'s doc.
  if (!mimeTypeMatchesRole(role, download.contentType)) {
    return { status: "invalid", reason: "content_type_mismatch" };
  }

  const extension = sourcePath.split(".").pop() ?? "";
  const destinationPath = `exercises/${exerciseId}/${role}.${extension}`;

  const listing = await deps.listExerciseFolder(exerciseId);
  if ("failed" in listing) {
    return { status: "list_failed" };
  }

  const rolePrefix = `${role}.`;
  const existingRoleFiles = listing.filter((file) =>
    file.name.toLowerCase().startsWith(rolePrefix),
  );

  if (existingRoleFiles.length > 0 && !replace) {
    return {
      status: "exists",
      existingPath: `exercises/${exerciseId}/${existingRoleFiles[0].name}`,
    };
  }

  // Upload the new file BEFORE touching any existing one: if this fails,
  // the currently-assigned media for this role must stay active rather
  // than being left with nothing (F3/test scenario 7).
  const uploadResult = await deps.upload(
    destinationPath,
    download.bytes,
    download.contentType ?? undefined,
  );
  if (!uploadResult.ok) {
    return { status: "upload_failed" };
  }

  // Only now, with the new file durably in place, remove every *other*
  // sibling for this role (a different extension, or a leftover
  // duplicate), so at most one file per role exists afterward.
  const staleSiblingPaths = existingRoleFiles
    .map((file) => `exercises/${exerciseId}/${file.name}`)
    .filter((path) => path !== destinationPath);

  if (staleSiblingPaths.length === 0) {
    return { status: "assigned", destinationPath };
  }

  const cleanedUp = await removeWithRetry(deps, staleSiblingPaths);
  if (!cleanedUp) {
    // The assignment itself succeeded - the new file is live and, per
    // pickRoleMedia()'s most-recently-updated tie-break, will already be
    // the one every surface resolves to. Only the *cleanup* failed, so
    // this must never be reported as a plain, fully-clean "assigned" - the
    // caller (and the UI) needs to know a stale sibling is still sitting
    // in Storage.
    return { status: "assigned_with_cleanup_warning", destinationPath, staleSiblingPaths };
  }

  return { status: "assigned", destinationPath };
}
