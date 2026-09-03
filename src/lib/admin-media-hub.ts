/**
 * Admin Media Hub — pure, testable state helpers and the category registry.
 *
 * The registry is data-only so new media categories can be added without
 * redesigning the hub page.
 */

export interface AdminMediaCategory {
  id: string;
  title: string;
  description: string;
  to: "/admin/media/about" | "/admin/exercise-registry";
}

export const ADMIN_MEDIA_CATEGORIES: readonly AdminMediaCategory[] = [
  {
    id: "about",
    title: "מי אנחנו",
    description: "תמונות צוות וגלריות עמודי מי אנחנו",
    to: "/admin/media/about",
  },
  {
    id: "exercises",
    title: "מאגר תרגילים",
    description: "תמונות, סרטוני הדגמה ומדיה לתרגילים",
    to: "/admin/exercise-registry",
  },
];

/** The existing-media gallery is always collapsed until explicitly opened. */
export const GALLERY_DEFAULT_EXPANDED = false;

export function toggleGalleryExpanded(expanded: boolean): boolean {
  return !expanded;
}

/**
 * Uploader reset: drop finished jobs, keep failures visible for retry.
 * This only clears UI state — no media is ever deleted here.
 */
export function pruneCompletedUploadJobs<T extends { stage: string }>(jobs: readonly T[]): T[] {
  return jobs.filter((job) => job.stage !== "הושלם");
}

export function allUploadJobsSucceeded(jobs: readonly { stage: string }[]): boolean {
  return jobs.length > 0 && jobs.every((job) => job.stage === "הושלם");
}
