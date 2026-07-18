# Sprint 1 – Active Workout Experience

Rebuild the workout flow from weekly plan → active session → summary → history, keeping the current Viora dark/lime glass style and Hebrew RTL. No UI redesign of unrelated screens.

## Scope

Weekly plan → workout details → AI briefing → active session (sets, rest timer, edits, add/delete) → celebration → summary → feedback → save → history (view + edit).

## Database (migration)

Extend existing tables (keep back-compat with `workout_templates`, `workout_template_exercises`, `workouts`, `workout_sets`, `exercises`):

- `workout_plans` — weekly plan per user (7 slots, each `template_id` nullable + display name).
- `workout_sessions` — one row per started workout: `template_id`, `started_at`, `finished_at`, `duration_seconds`, `status` (`in_progress|completed|discarded`), `difficulty`, `energy`, `pain` (`none|mild|significant`), `notes`, `edited_at`.
- Extend `workout_sets` with: `session_id`, `position`, `completed_at`, `planned_rest_seconds`, `actual_rest_seconds`, `overtime_seconds`.
- All RLS scoped to `auth.uid()`, full GRANTs, `updated_at` triggers.

## Routes

- `/workouts` — weekly plan (existing route, rebuilt minimal).
- `/workouts/plan/$day` — assign a template to a weekday.
- `/workouts/session/$sessionId/brief` — 2–4 line AI briefing + Start button.
- `/workouts/session/$sessionId` — active session UI (replaces `/workout-session/$workoutId`).
- `/workouts/session/$sessionId/summary` — celebration + summary + feedback in one scroll, single Save.
- `/workouts/history` — list of completed sessions.
- `/workouts/history/$sessionId` — view + edit a completed session.

Old `/workout-session/$workoutId` route stays as a redirect to the new one for safety.

## Components

- `WeeklyPlanGrid` — 7 day cards, tap opens details/assign.
- `PreWorkoutBrief` — rule-based briefing (today's workout name, last session volume delta, one tip: hydration / heavier weight / focus form based on last RPE & pain).
- `ActiveExerciseCard` — image, name, "exercise n/N", editable set rows (weight, reps), complete/uncomplete tap, add/delete inline, prev/next.
- `RestTimerBar` — fixed bottom; auto-starts on complete; ±15s; red count-up past zero; vibrates once at 0; keeps running when navigating exercises.
- `ExitDialog` — three actions (Continue / Save Progress / Discard).
- `SummaryFeedback` — duration, exercises, sets, total volume (Σ weight×reps), PRs (per-exercise max weight vs history), difficulty 1–5, energy 1–5, pain 3-option, single "שמור" → home.
- `HistoryList` / `HistoryDetail` with inline edit.

## Rest timer behavior

- Timer state stored per session in a Zustand-lite hook (`useRestTimer`) with `startedAt` timestamp so background/lock/return keeps accurate time (recompute from `Date.now() - startedAt`).
- Vibrate via `navigator.vibrate` at 0 (respect reduced-motion by skipping vibration if user prefers reduced motion).
- Push notification when rest ends: register a one-shot `setTimeout` + `Notification` request on first workout; graceful no-op if permission denied (Sprint 1 acceptable). No service worker added.
- Stops only when the next set is marked completed; saves `planned_rest`, `actual_rest`, `overtime`.

## Editing sets

- Editing weight/reps auto-propagates to all following **unfinished** sets in the same exercise.
- Add Set → clones previous set values, editable, no popup.
- Delete Set → immediate, re-numbers `position`.
- Tapping a completed set toggles it back to editable; timer keeps running.

## AI briefing / insight (rule-based)

- Briefing lines: `היום: {template name}` · `אימון קודם: {volume} ק"ג · {delta}` · one tip from ranked rules (pain last time → deload; low energy → keep RPE ≤7; else → try +2.5kg on main lift).
- Post-workout insight: single line based on this session's volume vs 7-day avg + pain answer.

## History & edit

- List sessions desc by `finished_at`, show template name, duration, volume, PR badge.
- Detail = read-only summary + "ערוך" toggling inline edits on sets/feedback. Saving updates aggregates and sets `edited_at`.

## i18n

Add Hebrew strings for all new labels under `workouts.*` and `session.*` in `src/lib/i18n.ts`.

## Out of scope (explicitly not built)

AI chat, meal/nutrition changes, advanced graphs, long-term memory, exercise replacement, health sync, smart watch, payments, social. Existing dashboard, meals, capture, profile untouched except for links.

## Technical notes

```text
useRestTimer (per session id)
  ├─ startedAt: number   // wall clock
  ├─ plannedSec: number
  ├─ tick via rAF interval
  └─ derived: elapsed, remaining, overtime, phase (running|zero|red)
```

Session state kept in TanStack Query; sets are the source of truth in DB. Optimistic updates for tap-complete, add/delete/edit — rollback on error with toast.

## Deliverables

1 migration, ~10 new files, updates to `/workouts` route and `AppShell` history link. TypeScript + lint pass. Manual test path: assign template to today → open → brief → start → complete 2 sets → edit reps → add set → next exercise → finish → feedback → save → history → edit.
