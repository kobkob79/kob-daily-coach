# Workout Integration & Consistency Audit (Credit 1/5)

Engineering report only. No feature work, no redesign, no implementation in this credit.

---

## 1. Architecture Review

The current architecture is **three-quarters correct**. Screens are already separated, and one shared matcher (`workout-occurrence.ts`) exists. What is missing is a persisted identity for "a workout that was planned for a specific date".

Today the model is:

```text
workout_templates          content (what exercises)
workout_template_exercises  content
workout_plans               7 recurring weekday slots (no date, no week)
workout_sessions            execution record (started_at, status, plan_weekday int)
workout_sets                execution data
workouts (legacy)           parallel old execution table, still has 28 sets attached
```

There is no row anywhere that means "Monday 3 Aug, Push, planned". That object only exists as a runtime derivation inside `matchSessionsToSlots()`. Every inconsistency the product shows traces back to this single gap: planning state is computed from execution rows instead of being stored.

Verified against the database:
- `workout_plans` holds 10 rows across 2 users, unique on `(user_id, weekday)` — correct, but weekday-only (recurring, dateless).
- `workout_sessions`: 17 completed, of which **only 10 carry `plan_weekday`** — 7 completed sessions still depend on the legacy heuristic. 30 discarded rows, 1 in_progress.
- Structural guards are in place and healthy: `workout_sets_session_exercise_setnum_key (session_id, exercise_id, set_number)` and `workout_sessions_one_active_per_user`. The duplicate-sets class of bug is fixed at the database level.
- 28 `workout_sets` rows still point at `workout_id` (legacy `workouts` table, 10 rows) and have no session.

## 2. Module Responsibility Review

| Module | Responsibility | Verdict |
| --- | --- | --- |
| `workouts.index.tsx` (Hub) | "What now?" | Correct intent, but owns its own next-workout algorithm, its own template-meta query and its own duration formula |
| `workouts.program.tsx` (Planner) | "What remains this week?" | Mostly correct; still renders completion (`הושלמו`, completed chips, % ring) — outcome data on a planning screen |
| `workouts.session.$sessionId.*` | Execute | Correct. Leave untouched |
| `workouts.history.tsx` / `.$sessionId` | Completed only | Correct filter; contains dead branches rendering `discarded` / `in_progress` states that can never appear |
| `weekly-planner.ts` | Planning pure helpers | Correct and well-scoped. Keep |
| `workout-occurrence.ts` | Session ↔ slot matching | Right idea, wrong primitive (weekday int, no date) |
| `workout-session.ts` (801 lines) | Plans + sessions + sets + seeding + PR analytics | Overloaded god module; also still uses `as any` casts although the generated types now include these tables |
| `workout-session.$workoutId.tsx` (legacy) | Old execution flow | Legacy. Reachable route, writes sets outside the session lifecycle |
| `services/sessions.service.ts`, `services/programs.service.ts` | Same reads/writes again | Duplicate API surface over the same tables |

### Overlapping responsibilities
1. **Planner shows outcome.** Completion count, percentage ring and "הושלם" chips are History-domain facts rendered on the planning screen. This is the literal "Planner displays completed workouts" complaint.
2. **Hub and Planner each own a next/remaining calculation** with different rules and different duration math.
3. **Home dashboard owns a third weekly-completed count** (`buildWeeklyProgress` over completed session dates) that does not go through `matchSessionsToSlots`, so Home and Planner can disagree.
4. **Two execution flows exist** (`/workouts/session/$sessionId` and legacy `/workout-session/$workoutId`).

### Untouched
`workouts.session.*` routes, `FloatingRestTimer`, `ExerciseHero`, `ExercisePicker`, `exercise-stats.ts`, `useWorkoutTimer`, `ActiveWorkoutBar`, seeding logic, PR logic.

## 3. Integration Review — where orchestration breaks

1. **Next Workout can jump to next week.** The Hub scans `offset = 0..6` from today, so once today's and later days are consumed it wraps into next week's weekday slots, while an unfinished earlier-in-week workout is filtered out as `missed` and shown nowhere. Nothing in the system represents "overdue but still doable".
2. **Active session claims a weekday regardless of date.** `matchSessionsToSlots` date-filters completed sessions to the current week but claims the in_progress session by `plan_weekday` alone. A session started last week keeps owning this week's card.
3. **Legacy claim path.** For the 7 completed sessions with `plan_weekday = NULL`, the matcher guesses via `template_id` + `started_at` weekday. Any near-miss silently shows a planned day as completed or an executed day as not done.
4. **Planner ↔ Session:** one-directional and correct (planner never writes sessions). Keep this.
5. **Session ↔ History:** correct, driven by `status = 'completed'`. The stated "completed workouts appear outside History" symptom is the Planner rendering completion, not History losing rows.
6. **Cache keys are fragmented** — `weekly-plan`, `planner_week_sessions`, `sessions.recent`, `active-session`, `template_meta`, `planner_templates_meta` — so a finish invalidates some surfaces and not others.

## 4. Technical Debt Report

| Debt | Status | Severity |
| --- | --- | --- |
| Missing persisted Workout Instance identity | Confirmed — root cause | Critical |
| Legacy matching heuristics (`plan_weekday IS NULL`) | Confirmed, 7 live rows | High |
| Duplicate set generation | Fixed (DB unique index + in-flight guard). No further work | Resolved |
| Next Workout calculation | Confirmed broken (week wrap, missed days dropped) | High |
| Planner ↔ Session sync | Correct direction, wrong primitive | Medium |
| Session ↔ History sync | Healthy | Low |
| `as any` casts across `workout-session.ts` | Stale, types now exist | Medium |
| Legacy `workouts` table + `/workout-session/$workoutId` route | Live, 28 orphan sets | Medium |
| 30 discarded sessions as permanent noise | Cosmetic | Low |

## 5. Legacy Code Report

- `src/routes/_authenticated/workout-session.$workoutId.tsx` — parallel execution UI, no lifecycle, writes to legacy `workouts`.
- `workouts` table + `workout_sets.workout_id` — dead write path, live read risk in PR/volume queries (they filter by `completed_at`, not by session, so legacy rows leak into PR math).
- `services/sessions.service.ts`, `services/programs.service.ts` — second API over the same tables.
- Legacy branch inside `matchSessionsToSlots` (`plan_weekday IS NULL` heuristic).
- Dead status branches in `workouts.history.tsx`.

## 6. Duplicate Logic Report

| Logic | Duplicated in |
| --- | --- |
| Duration estimate | `weekly-planner.estimateMinutes` (max(sets×3.5, ex×8)) vs Hub-local `estimateMinutes` (sets×3.5) — same workout, two numbers |
| Template meta aggregation | Hub `template_meta` query vs Planner `planner_templates_meta` query |
| Weekly completed count | Planner (`matchSessionsToSlots`) vs Dashboard (`buildWeeklyProgress`) |
| Start-of-week | `weekly-planner.startOfWeek` and `workout-occurrence.startOfWeek` |
| Plan slot write | `setPlanSlot` and `programsService.assignDay` |
| Active session read | `getActiveSession` and `sessionsService.getActive` |
| Elapsed-time timer | `ActiveWorkoutBar`, Hub `ActiveSessionCard`, `useWorkoutTimer` |

## 7. Recommended Workout Domain Model

Introduce one persisted object — the missing primitive — and make everything else derive from it.

```text
WorkoutTemplate      what to train (unchanged)
WorkoutPlanSlot      recurring intent per weekday (unchanged)
WorkoutInstance      NEW: one dated occurrence
                     (user_id, scheduled_date, template_id, plan_weekday,
                      display_name, status, session_id)
WorkoutSession       execution record -> instance_id
WorkoutSet           execution data (unchanged)
```

`WorkoutInstance.status` is the single lifecycle: `planned → active → completed | skipped`. Exactly one state, one owner, one writer (the session lifecycle transitions it).

Ownership map:
- Plan slots own recurring intent.
- Instances own dated planning state and completion linkage.
- Sessions own performance data.
- Sets own reps/weight.
- Templates own exercise content.

Instances are materialised lazily for the visible week from plan slots, so the planner never auto-copies a week and legacy heuristics disappear.

## 8. Recommended Screen Responsibilities

| Screen | Shows | Never shows |
| --- | --- | --- |
| Workout Home | Exactly one primary action: resume active → overdue instance → today's instance → next dated instance. Plus a single "remaining this week: n" line | Completion history, weekly editing, duration disagreeing with Planner |
| Weekly Planner | Dated instances for the week with `planned / active / overdue / rest / empty`, edit + drag | Completion counts, % ring, "הושלם" chips |
| Session | Execute and finish | Planning, history |
| History | `status = completed` sessions, chronological | Planned or active workouts, discarded rows |

"Overdue" replaces "missed": the day passed, the instance is still `planned`, and it stays actionable from Home — which is what closes the "Next Workout points to next week" complaint.

## 9. Recommended Integration Improvements

1. One source for dated planning: `workout-instance.ts` replaces `matchSessionsToSlots` heuristics.
2. One duration formula and one template-meta query, shared by Hub and Planner.
3. One weekly-progress selector consumed by Planner and Home.
4. One invalidation helper (`invalidateWorkoutDomain(qc)`) called on start / finish / discard / plan edit.
5. Split `workout-session.ts` into `workout-plan.ts`, `workout-session.ts` (lifecycle), `workout-sets.ts`, `workout-prs.ts` — move only, no behaviour change.
6. Retire the legacy execution route and quarantine legacy `workout_id` sets from PR math.

## 10. Implementation Roadmap (Credits 2–5)

**Credit 2 — Instance identity (highest UX return per line changed)**
- Migration: `workout_instances` table (grants, RLS, unique `(user_id, scheduled_date)`), `workout_sessions.instance_id`.
- Backfill instances from the 17 completed + 1 active session using `plan_weekday` where present and `started_at` otherwise; this is the one and only time the heuristic runs.
- New `src/lib/workout-instance.ts`: ensure-week, list-week, transition helpers.
- Session start/finish/discard writes the instance status.
- Deliverable: planned and completed can no longer be confused. `workout-occurrence.ts` legacy branch deleted.

**Credit 3 — Screen responsibility cleanup (no redesign)**
- Planner reads instances; remove completion count, % ring and completed chips; add `overdue`.
- Hub next-action order: active → overdue → today → next dated instance; delete Hub-local duration/meta logic in favour of shared selectors.
- Home weekly progress switches to the shared selector.
- History drops dead status branches.

**Credit 4 — Legacy removal and module split**
- Remove `/workout-session/$workoutId`, redirect to `/workouts`; migrate or archive the 28 legacy sets and exclude them from PR queries.
- Delete `services/sessions.service.ts` / `programs.service.ts`.
- Split `workout-session.ts`; drop `as any` in favour of generated types.
- Single `invalidateWorkoutDomain` helper.

**Credit 5 — Consistency hardening**
- Timer logic consolidated into `useWorkoutTimer`.
- Hide discarded sessions everywhere; optional cleanup job.
- Lifecycle test matrix: start, resume, background, overdue, week rollover, plan edit mid-week, two slots sharing a template.
- Update `docs/product-backlog.md` and the dependency map with the new domain model.

Nothing in Credits 2–5 changes the visual language; all work is structural.
