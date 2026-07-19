# Sprint 2 — Workout Experience 2.0

Rebuild the workout area end-to-end while keeping DB, routes and libs already in place. Preserve everything outside `/workouts*`.

## 1. Design tokens (workout-scoped)

Add scoped tokens in `src/styles.css` under a `.workout-theme` wrapper — dark navy/black bg, dark-purple surface, neon-lime accent (`--gym-accent: oklch(0.92 0.22 130)`), neon glow shadow, larger radii. Apply the class on `<div>` wrapping every workout route so the rest of the app stays untouched.

## 2. Data + libs

Extend `src/lib/workout-session.ts`:
- `getLastPerformanceByExercise(exerciseId)` → returns most recent completed session's sets (weight/reps per set_number).
- `seedSessionFromTemplate(sessionId, templateId)` — reads `workout_template_exercises`, for each exercise fetches last performance and inserts planned sets (real history first, fallback to template targets).
- `getExercisePR(exerciseId)` → user's max weight.
- Group helpers via `muscle-groups.ts`.

New `src/hooks/useWorkoutTimer.ts`:
- Stores `{ sessionId, startedAt }` in `localStorage` (`viora:workout-timer`).
- Reads elapsed from `Date.now() - startedAt` — survives reloads, backgrounding, navigation.
- Cleared only on finish/discard.

## 3. Routes

- `/workouts` (rewrite): program progress card at top (uses week/cycle based on `life_profile.work_type === 'shift'`), timeline of planned workouts with status (Completed / Next / Upcoming), neon outline on next.
- `/workouts/program` (new): "התוכנית שלך" — hero, phase/week cards, completion.
- `/workouts/session/$sessionId` (rewrite): **overview** grouped by muscle, tappable cards with 3 states (not started / in progress / completed with green check + PR trophy). Fixed bottom bar: total timer + "סיים אימון".
- `/workouts/session/$sessionId/exercise/$exerciseId` (new): detail with per-set rows (set # · weight · reps · ✓ button). Auto-propagate edits to unfinished sets (debounced). Tap completed row to un-complete. Add/delete set inline (no confirm during active workout). Rest timer persists at bottom.
- `/workouts/history/$sessionId`: keep, add confirm-on-delete for sets.

## 4. Persistent total timer

Bottom bar on every `/workouts/session/*` route shows the running total. Timer state hydrated from `localStorage`, keeps counting across route changes, reloads, backgrounding.

## 5. Previous-performance seeding

On session brief → "Start", call `seedSessionFromTemplate`. For each template exercise, load last completed session's sets and insert into `workout_sets` for the new session. Never overwrite existing sets on resume.

## 6. Program overview data

- Normal user: week = ISO week; progress = completed sessions in current week / template count in `workout_plans`.
- Shift worker: cycle position from `getShiftCycleForDate(today)`; progress across the 9-day cycle.

## 7. Testing

After implementation: run typecheck and drive Playwright against `http://localhost:8080/workouts` — assign template, start, verify overview → detail → set complete → rest timer → total timer persists across navigation → finish flow. Screenshot each step.

## Files touched

- `src/styles.css` — scoped `.workout-theme` tokens
- `src/lib/workout-session.ts` — add seeding + last-performance + PR helpers
- `src/hooks/useWorkoutTimer.ts` — new
- `src/routes/_authenticated/workouts.tsx` — rewrite home
- `src/routes/_authenticated/workouts.program.tsx` — new
- `src/routes/_authenticated/workouts.session.$sessionId.tsx` — rewrite as overview
- `src/routes/_authenticated/workouts.session.$sessionId.exercise.$exerciseId.tsx` — new detail
- `src/routes/_authenticated/workouts.session.$sessionId.brief.tsx` — wire seeding
- `src/routes/_authenticated/workouts.session.$sessionId.summary.tsx` — apply theme
- `src/routes/_authenticated/workouts.history.$sessionId.tsx` — confirm delete
- `src/lib/i18n.ts` — new strings

No DB migration needed — existing tables cover everything.
