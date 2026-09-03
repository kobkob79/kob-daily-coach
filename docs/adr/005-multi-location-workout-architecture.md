# ADR 005: Multi-Location Workout Architecture

## Decision

A workout location becomes a first-class, user-owned entity (`workout_locations`), not a visual folder. Four new/extended entities carry it end to end:

- `equipment_instances` — a physical machine at one location (e.g. "Chest Press – Panatta" at אייקון שדרות). Not exercise-bound; one machine can serve several canonical exercises.
- `location_exercise_configs` — the join of user + location + canonical exercise + equipment instance + local weight settings (increment, unit, default machine for that exercise at that location).
- `workout_templates.location_id`, `workout_instances.location_id`, `workout_sessions.location_id` — a routine belongs to a location; a session freezes its location at open time (mutable only until the first set is logged, then locked by trigger).
- `workout_sets.location_id` / `equipment_instance_id` / `weight_unit` — denormalized onto every set so PRs, last-performance and recommendations can be computed directly from `workout_sets` without joining sessions.

Canonical `exercises` stay global and unduplicated. Location scopes *performance data* (weights, PRs, recommendations), never the exercise catalog.

PR, last-weight, and recommendation queries key on `(user_id, exercise_id, location_id, equipment_instance_id)` — never on `(user_id, exercise_id)` alone. A machine seen for the first time at a location starts with no history and is never pre-filled from another location without explicit user confirmation. Cross-location comparisons in My Insights are additive summaries, visually distinguished from same-machine progress and never labeled as a direct PR.

Full data model, migration phasing, code impact map, wireflows, and risk list live in `docs/multi-location-workout-architecture-proposal.md`. No migration runs and no implementation PR opens in this sprint — schema and screens are design-only pending Viora Super Agent approval.

## Rejected alternatives

- **Folder-only grouping (client-side tag on routines, no DB entity):** cannot separate weight history or PRs per machine; the exact bug the sprint exists to fix.
- **Global `equipment_instances` shared across users (a "gym catalog"):** invents facility data Viora has no source for and creates cross-user visibility risk; equipment stays user-owned like `exercise_equipment_profiles` already is.
- **Duplicating canonical exercises per gym ("Chest Press (Icon)", "Chest Press (Intel)"):** explicitly forbidden by the sprint; breaks the shared exercise library, media pipeline, and advisor exercise-name rules.
- **Guessing historical location from time-of-day or template heuristics during migration:** explicitly forbidden; unresolved historical rows stay `location_source = 'unknown'`, never silently assigned.
- **Retrofitting `exercise_equipment_profiles`/`exercise_insights` in place instead of adding `equipment_instances`/`location_exercise_configs`:** those tables (added 2026-09-02) are exercise-scoped only, with no location concept and no physical-machine identity; extending them would conflate "my note about an exercise" with "a specific machine at a specific gym." They are kept, and `equipment_profile_id` on `exercise_insights` is reinterpreted as pointing at a location-scoped `equipment_instances` row going forward (see proposal §"Reconciling `exercise_equipment_profiles`").

## Compatibility and migration posture

Every new column is nullable and every new table is additive; no existing row is dropped, altered destructively, or reassigned without an explicit user action. Historical routines/sessions/sets keep `location_id = NULL` and `location_source = 'unknown'` until the user runs the (future, separately-approved) reconciliation wizard, which can bulk-assign a chosen default location but never infers one per row. `NOT NULL` on `location_id` is never enforced retroactively at the DB level — only for new writes, at the application layer, once the reconciliation UX ships.

## Future implications

The Advisor's training persona ("Daniel") must read the active session's `location_id` from the same context bridge already scoped in ADR 003, and must not recommend a weight sourced from a different location's equipment instance without the user opting in. A later sprint may consider deprecating `exercise_insights.category = 'working_weight'` in favor of the structured `location_exercise_configs.weight_increment_kg`/`weight_unit`, but the free-text row is never deleted — only superseded.
