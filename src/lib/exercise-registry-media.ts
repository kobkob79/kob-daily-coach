import {
  EXERCISE_MEDIA_ROOT,
  getExerciseAssignedRole,
  pickRoleMedia,
  type ExerciseAssignedRole,
} from "./exercise-media.ts";
import type { ExerciseMediaStatus } from "./exercise-registry.ts";
import type { MediaItem } from "../services/media.service.ts";

export interface AssignedExerciseMedia {
  readonly thumbnail: MediaItem | null;
  readonly main: MediaItem | null;
  readonly guide: MediaItem | null;
  readonly demo: MediaItem | null;
}

export class DuplicateExerciseMediaRoleError extends Error {
  readonly role: ExerciseAssignedRole;
  readonly paths: readonly string[];

  constructor(role: ExerciseAssignedRole, items: readonly MediaItem[]) {
    super(`Exercise media role "${role}" has multiple canonical files`);
    this.name = "DuplicateExerciseMediaRoleError";
    this.role = role;
    this.paths = items.map((item) => item.path);
  }
}

function normalizeStoragePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function scopeToCanonicalExerciseFolder(
  items: readonly MediaItem[],
  expectedExerciseId?: string,
): MediaItem[] {
  if (expectedExerciseId === undefined) return [...items];

  const prefix = `${EXERCISE_MEDIA_ROOT}/${expectedExerciseId}`;
  return items.filter((item) => {
    const path = normalizeStoragePath(item.path);
    const separatorIndex = path.lastIndexOf("/");
    const parentFolder = separatorIndex === -1 ? "" : path.slice(0, separatorIndex);
    return parentFolder === prefix;
  });
}

/**
 * Resolves only explicit canonical assignments. When `expectedExerciseId` is
 * omitted the caller is responsible for supplying items from one ID folder.
 */
export function resolveAssignedExerciseMedia(
  items: readonly MediaItem[],
  expectedExerciseId?: string,
): AssignedExerciseMedia {
  const scopedItems = scopeToCanonicalExerciseFolder(items, expectedExerciseId);
  const roles: readonly ExerciseAssignedRole[] = ["thumbnail", "main", "guide", "demo"];
  const assigned = new Map<ExerciseAssignedRole, MediaItem | null>();

  for (const role of roles) {
    const matches = scopedItems.filter((item) => getExerciseAssignedRole(item) === role);
    if (matches.length > 1) throw new DuplicateExerciseMediaRoleError(role, matches);
    assigned.set(role, pickRoleMedia(matches, role)?.item ?? null);
  }

  return {
    thumbnail: assigned.get("thumbnail") ?? null,
    main: assigned.get("main") ?? null,
    guide: assigned.get("guide") ?? null,
    demo: assigned.get("demo") ?? null,
  };
}

export function resolveExerciseMediaStatus(
  items: readonly MediaItem[],
  expectedExerciseId?: string,
): ExerciseMediaStatus {
  const assigned = resolveAssignedExerciseMedia(items, expectedExerciseId);
  return {
    hasCover: assigned.main !== null,
    hasInfographic: assigned.guide !== null,
    hasThumbnail: assigned.thumbnail !== null,
    hasDemo: assigned.demo !== null,
  };
}
