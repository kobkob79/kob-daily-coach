/**
 * Home layout registry (VIORA-HOME-IMPLEMENTATION-001)
 *
 * Declares the widget slots of the Home Command Center so future phases can
 * reorder, hide or insert widgets without touching the dashboard layout.
 * Pure data — no React, no fetching.
 */

export type HomeWidgetId =
  | "hero"
  | "priorities"
  | "snapshot"
  | "weekly-progress"
  | "quick-actions"
  | "coach"
  | "timeline";

export interface HomeWidgetSlot {
  id: HomeWidgetId;
  /** Lower renders first. */
  order: number;
  /** Phase 1 widgets are always enabled; future phases may gate by profile. */
  enabled: boolean;
  collapsible: boolean;
}

/** Default Phase 1 order. */
export const HOME_LAYOUT: HomeWidgetSlot[] = [
  { id: "hero", order: 10, enabled: true, collapsible: false },
  { id: "priorities", order: 20, enabled: true, collapsible: true },
  { id: "snapshot", order: 30, enabled: true, collapsible: true },
  { id: "weekly-progress", order: 40, enabled: true, collapsible: false },
  { id: "quick-actions", order: 50, enabled: true, collapsible: false },
  { id: "coach", order: 60, enabled: true, collapsible: false },
  { id: "timeline", order: 70, enabled: true, collapsible: true },
];

export function homeWidgetSlot(id: HomeWidgetId): HomeWidgetSlot {
  return (
    HOME_LAYOUT.find((s) => s.id === id) ?? { id, order: 999, enabled: true, collapsible: false }
  );
}

export function orderedHomeWidgets(): HomeWidgetSlot[] {
  return [...HOME_LAYOUT].filter((s) => s.enabled).sort((a, b) => a.order - b.order);
}
