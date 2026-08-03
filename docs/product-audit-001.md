# VIORA-AUDIT-001 — Complete Product, UX, Architecture & Codebase Audit

Version 1.0 · Documentation only · No application code was modified.
Companion to [Master Product Backlog](./product-backlog.md), [Dependency Map](./product-dependency-map.md), [Roadmap](./product-roadmap.md), [Workout UX Philosophy](./workout-ux-philosophy.md).

Audit basis: ~29,300 lines of TypeScript across 191 files, 30 authenticated routes, 11 services, 36 lib modules, 3 server functions, 22 database tables, 6 storage buckets.

---

## 0. Executive verdict

Viora is a genuinely ambitious personal-health OS with an unusually strong workout core and a coherent luxury Hebrew RTL identity. It is **not launch-ready**, and the reasons are structural rather than cosmetic:

1. **Data access has no single owner.** A `services/` layer exists but only 7 files use it; 20+ routes and 4 components import the Supabase client directly. The abstraction is decorative.
2. **Routes are pages, not modules.** Six route files exceed 500 lines (`dashboard.tsx` 934, `meals.tsx` 806, `capture.tsx` 774, exercise session 772, `profile.tsx` 677, `workouts.index.tsx` 657). Business logic, queries and presentation are fused.
3. **Almost no route defines `errorComponent` or `notFoundComponent`.** Only `__root.tsx` and the OAuth consent route do. Any failed read on any screen degrades to a blank or half-rendered page.
4. **`head()` metadata exists on 4 of 30+ routes.** SEO/shareability is effectively unimplemented outside the workout/dev areas.
5. **No offline story at all.** No service worker, no write queue, no PWA install path — despite the product being used in gyms and hospital-shift contexts where signal drops. This is the single biggest gap between the product's promise and its reality.
6. **No realtime.** Zero `postgres_changes` subscriptions; every "live" surface is polling or invalidation-driven.
7. **Query hygiene is weak.** 40+ `select("*")` call sites, including on wide tables (`profiles`, `nutrition_entries`, `workout_sets`), shipping unused columns to a mobile client on every render.

The good news: the database is clean (linter: zero findings), RLS is present on all 22 tables, 17 indexes exist, and the workout domain (`workout-session.ts`, `workout-occurrence.ts`, `useRestTimer.ts`) is the best-engineered part of the codebase and should be the template for every other module.

---

## 1. Top 100 improvement opportunities

Grouped by domain. Each has a suggested Feature ID namespace for backlog registration.

### Foundation & architecture (1–18)

1. Enforce the `services/` layer: no route or component may import `@/integrations/supabase/client` directly.
2. Collapse `src/lib/*` into domain folders (`src/domains/workout`, `/nutrition`, `/health`, `/ai`) — 36 flat files is past the navigable limit.
3. Split every route file above 300 lines into a route shell plus feature components.
4. Introduce a shared `queryKeys` factory; keys are currently string literals scattered across files, making invalidation guesswork.
5. Standardize query/mutation option builders per domain so caching policy is declared once.
6. Add `errorComponent` + `notFoundComponent` to all 30 authenticated routes.
7. Add `pendingComponent` with skeletons matching final layout to all data routes.
8. Replace `select("*")` with explicit column projections at all 40+ sites.
9. Add a typed `Result`/error envelope in `services/base.ts` and stop swallowing Supabase errors.
10. Introduce Zod schemas at every Supabase read boundary; today DB shape drift fails silently at render time.
11. Centralize date/biological-day logic — `date.ts`, `day-context.ts`, `daily-engine.ts` and `shift.ts` overlap.
12. Deduplicate AI context assembly across `ai-context.ts`, `intelligence.ts`, `coach-memory.ts`, `daily-brief.ts`, `home-insight.ts`.
13. Define one `AIContext` type as the sole input contract for every AI feature.
14. Move all AI calls behind server functions; audit for any client-side model invocation.
15. Add a repository-level import lint rule preventing `*.server` leakage into route chunks.
16. Adopt a naming convention: `*.service.ts` for IO, `*.engine.ts` for pure logic, `*.functions.ts` for RPC. Current mix is inconsistent.
17. Extract magic numbers (rest defaults, BMR coefficients, hydration targets) into a single `constants/` module.
18. Document module ownership in `AGENTS.md` so future sprints know where new code belongs.

### Data & backend (19–32)

19. Add composite indexes on `(user_id, date)` / `(user_id, biological_day)` for `nutrition_entries`, `daily_events`, `daily_notes`.
20. Add `(user_id, started_at desc)` index on `workout_sessions` for history paging.
21. Add `(session_id, position)` index on `workout_sets`.
22. Introduce server-side aggregate views (weekly volume, per-muscle volume) instead of client-side reduction over raw sets.
23. Add DB-level check constraints on rating columns (`mood`, `energy`, `difficulty` 1–5/1–10) — currently unenforced integers.
24. Deduplicate `nutrition_entries` legacy columns (`meal` enum vs `meal_type` text, `food_name` vs `foods` jsonb). Two generations of schema coexist.
25. Same for `workout_sets.workout_id` vs `session_id` — legacy `workouts` table still referenced.
26. Plan a deprecation migration for the legacy `workouts` table.
27. Add soft-delete/audit columns on user-generated content before launch (deletion is currently destructive).
28. Add storage lifecycle rules; six private buckets with no retention policy will grow unbounded.
29. Enforce upload size/type validation server-side, not only in the picker.
30. Add signed-URL caching layer — media URLs are re-signed per render in gallery views.
31. Introduce `user_roles` table now (per backlog `CORE-006`), before multi-profile forces a schema rewrite.
32. Add a nightly aggregation job for AI context to cut per-request cost and latency.

### Offline, reliability & performance (33–48)

33. Ship a service worker (`CORE-004`) — precache shell, runtime-cache media.
34. Ship an offline write queue (`CORE-003`) with idempotent set-logging replay (`WORKOUT-015`).
35. Persist TanStack Query cache to IndexedDB so a cold gym launch shows last-known state instantly.
36. Add optimistic updates to set logging, water logging and quick-add meals.
37. Add a PWA install prompt and correct `manifest.webmanifest` icons/maskables.
38. Route-level code splitting audit: verify heavy routes (`export`, `capture`, `health-book`) are not in the initial chunk.
39. Lazy-load `jspdf`/`html2pdf` — PDF tooling should never ship to users who never export.
40. Lazy-load `recharts` (chart.tsx, 331 lines) behind the statistics surfaces only.
41. Virtualize long lists (history, timeline, meal log) — currently full-array rendering.
42. Debounce/throttle the `ResizeObserver` in `AppShell` and cache the nav height in a CSS variable.
43. Replace polling-derived "live" surfaces with realtime subscriptions on `daily_events` and `workout_sets`.
44. Add image `width`/`height` and `aspect-*` wrappers everywhere to eliminate CLS.
45. Serve responsive/transformed media variants instead of full-resolution originals.
46. Add a request waterfall audit on `/dashboard` — it currently orchestrates the most parallel reads of any screen.
47. Measure and budget: LCP < 2.0s, INP < 200ms, JS < 250KB gzip on the dashboard.
48. Add an error/perf telemetry sink beyond `error-capture.ts` local logging.

### Navigation & information architecture (49–58)

49. The nav exposes far fewer destinations than exist — 30 routes, a handful reachable. Add a proper "more" surface.
50. `hydration.tsx` (478 lines) duplicates the `WaterGoal` card; merge into one hydration domain.
51. `meals.tsx`, `nutrition.tsx` and the capture meal flow are three entry points to one concept — consolidate.
52. `journal.tsx`, `health.tsx` and `MorningIntake` overlap on daily subjective logging — merge into one Daily Log.
53. `progress.tsx` vs workout history vs profile gallery — three progress views, no single canonical one.
54. `workout-session.$workoutId` and `workouts.session.$sessionId.*` are two session route families; retire the legacy one.
55. `dev.assets` redirect shim can be removed once links are updated.
56. Add breadcrumbs or a consistent back affordance to nested workout routes.
57. Define a canonical post-action destination policy (after finish workout / after log meal / after capture).
58. Add deep-link-safe URLs for share targets; hash-free, SSR-friendly.

### UX & mobile ergonomics (59–74)

59. Establish a single loading-state kit (skeleton, spinner, shimmer) — currently ad hoc per screen.
60. Establish a single empty-state kit with illustration + one primary action.
61. Establish a single error-state kit with retry, matching the pattern already proven in `AssignDayDialog`.
62. Audit all icon-only buttons for `aria-label`; the recessed AI nav button and media viewer controls are highest risk.
63. Enforce 44×44 minimum tap targets; several `size="icon"` (36px) controls sit in primary flows.
64. Replace `h-screen` with `h-dvh` wherever full-height layout is used.
65. Add `prefers-reduced-motion` handling to PR celebration, ring animations and the intro video.
66. Verify RTL correctness of every swipe/drag gesture, including the draggable rest timer.
67. Add haptic + visual confirmation consistency — some actions vibrate, some toast, some do nothing.
68. Standardize toast usage (sonner) — success/error/undo semantics.
69. Add undo to destructive actions (delete set, delete meal, reset onboarding).
70. Make number inputs use `inputMode="decimal"` and select-on-focus everywhere in the gym UI.
71. Reduce onboarding to the minimum viable fields; 386 lines of wizard is a launch-day drop-off risk.
72. Add a "skip for now" path with progressive profile completion prompts.
73. Add a global search / command surface (Hebrew) for the 30-route app.
74. Add contextual first-run coach marks on the workout session screen only.

### AI product (75–86)

75. Ship the "למה?" explanation on **every** AI surface, not only `SmartRecommendations`.
76. Add confidence labelling to vision extraction; silent wrong macros erode trust fastest.
77. Add a one-tap correction affordance on every AI output, feeding `ai_memory`.
78. Add an AI transparency screen: what Viora knows, from where, with per-item deletion.
79. Cache the daily AI context; regenerate on data change, not per view.
80. Add streaming responses to `AskVioraSheet` for perceived speed.
81. Add graceful degradation copy when the model is unavailable — currently failure looks like emptiness.
82. Add rate limiting and cost guardrails on vision analysis.
83. Add a golden-set eval harness for Hebrew coach output quality before launch.
84. Enforce the "today-only scope unless asked" rule in one place, not per feature.
85. Add proactive-notification policy gating so the coach never violates the workout philosophy.
86. Log AI outputs with the context snapshot for debuggability.

### QA, accessibility & launch readiness (87–100)

87. No test suite exists. Add unit tests for `shift.ts`, `daily-engine.ts`, `workout-session.ts`, `intelligence.ts` first.
88. Add Playwright smoke flows: sign-in → onboarding → log workout → finish → debrief.
89. Add a visual-regression pass on the five most-used screens.
90. Add axe-based accessibility CI on all routes.
91. Verify screen-reader Hebrew announcement order on the workout session screen.
92. Add focus-visible styling audit across the glassmorphism theme (low-contrast risk).
93. Contrast-audit `text-muted-foreground` on glass surfaces — likely below AA in several cards.
94. Add `lang="he"` / `dir="rtl"` verification at the document level.
95. Add a privacy policy, data-export and account-deletion path (`SETTINGS-007`) — legally required at launch.
96. Add a Settings screen; settings are currently scattered across profile, theme selector and dev console.
97. Gate the Developer Console behind a server-verified role, not only a client-side QA check.
98. Add release checklist automation (typecheck, lint, tests, bundle budget).
99. Add crash-free-session monitoring before public launch.
100. Add in-app feedback capture routed to a Supabase table.

---

## 2. Top 25 UX improvements

| # | Improvement | Why it matters |
| --- | --- | --- |
| 1 | Unified loading/empty/error state kit | Inconsistency reads as unfinished software on first use. |
| 2 | Merge the three nutrition entry points | Users cannot form a mental model of where meals live. |
| 3 | Merge journal + health + morning intake into one Daily Log | Same data, three doors. |
| 4 | One canonical Progress screen | Progress is the product's emotional payoff; it is currently fragmented. |
| 5 | Trim onboarding to 3 screens with progressive completion | Highest measurable drop-off risk. |
| 6 | Add a real Settings screen | Users cannot find theme, units, notifications or privacy. |
| 7 | Undo on every destructive action | Gym use is error-prone by nature. |
| 8 | 44px minimum touch targets everywhere | One-handed, sweaty-hand usage. |
| 9 | Number inputs: decimal keypad + select-on-focus | Removes ~2 taps per set. |
| 10 | Consistent post-action destinations | Currently unpredictable where you land. |
| 11 | Coach marks on first workout session only | The session UI is dense and undiscoverable. |
| 12 | Reduced-motion support | Celebrations are currently unavoidable. |
| 13 | Retry affordance on every failed read | The `AssignDayDialog` pattern generalized. |
| 14 | Timeline grouping by biological day with sticky headers | Long scroll is currently undifferentiated. |
| 15 | Quick-add meal favourites surfaced on Home | Directly serves the near-zero-typing goal. |
| 16 | Water logging from the nav without opening hydration | Highest-frequency action, currently 3 taps. |
| 17 | Persistent "what changed today" summary at the top of Home | Answers the only question users open the app to ask. |
| 18 | Clear distinction between planned and completed workouts | Currently visually similar in the hub. |
| 19 | Exercise picker with search + recent + muscle filter | Discoverability gap in routine building. |
| 20 | Routine builder reorder affordance clarity | Drag targets are small and undiscovered. |
| 21 | Rest timer: expose remaining time in the tab title / lock screen | Users leave the app during rest. |
| 22 | History: filter by exercise and date range | History is currently a flat list. |
| 23 | Body photo gallery comparison view (before/after slider) | Highest emotional-value feature not yet built. |
| 24 | Hebrew microcopy pass across all empty and error states | Several read as developer placeholders. |
| 25 | Global command/search surface | 30 routes exceed nav capacity. |

---

## 3. Top 25 technical improvements

1. Enforce the service layer boundary (lint-enforced).
2. Domain-folder restructure of `src/lib`.
3. Split all 500+ line route files.
4. Centralized `queryKeys` factory.
5. `errorComponent` / `notFoundComponent` on every route.
6. `pendingComponent` skeletons on every data route.
7. Explicit column projections replacing `select("*")`.
8. Zod validation at all read boundaries.
9. Typed error envelope; stop swallowing errors.
10. Single `AIContext` contract.
11. Deduplicate the five overlapping AI context builders.
12. Consolidate date/shift/biological-day logic.
13. Remove legacy `workouts` table and dual-column schemas.
14. Retire the legacy `workout-session.$workoutId` route family.
15. Add composite DB indexes for the hot query paths.
16. Server-side aggregate views for volume/statistics.
17. Signed-URL cache for media.
18. Import-guard lint rule for `*.server` modules.
19. Unit tests for the four pure-logic engines.
20. Playwright smoke suite for the core loop.
21. axe accessibility CI.
22. Bundle-size budget in CI.
23. Constants module for magic numbers.
24. Server-verified gating for the Developer Console.
25. Structured telemetry (errors, AI calls, perf) into Supabase.

---

## 4. Top 25 performance improvements

1. Persist the Query cache to IndexedDB.
2. Optimistic set logging.
3. Realtime subscriptions instead of broad invalidations.
4. Lazy-load PDF stack (`jspdf`, `html2pdf`, `health-book.ts` — 966 lines).
5. Lazy-load `recharts`.
6. Lazy-load the vision/capture route bundle.
7. Virtualize history, timeline and meal lists.
8. Explicit column selection (payload reduction on every screen).
9. Composite indexes on hot queries.
10. Precomputed weekly aggregates.
11. Cache the daily AI context.
12. Responsive media variants.
13. Signed-URL reuse.
14. `aspect-*` wrappers to kill CLS.
15. Preload the exercise hero media of the next exercise.
16. Debounce `ResizeObserver` in `AppShell`; publish nav height as a CSS var.
17. Reduce dashboard parallel-query fan-out via a single aggregate server fn.
18. Defer the intro video asset until after first paint.
19. Route-level prefetch on nav hover/press.
20. Service-worker runtime cache for media buckets.
21. Avoid re-signing storage URLs inside render.
22. Memoize heavy derived stats in the session screen.
23. Trim `i18n.ts` (633 lines) loading — split per domain.
24. Audit `sidebar.tsx` (744 lines of unused shadcn surface) — remove if unused.
25. Set explicit `staleTime`/`gcTime` per domain instead of defaults.

---

## 5. Top 25 AI opportunities

1. Post-workout debrief with progression-aware load prescription (`AI-005`).
2. Readiness score from sleep + shift + load (`HEALTH-005`).
3. Shift-aware training scheduling (`PLANNER-003`).
4. Cross-module pattern insights over 14+ days (`AI-006`).
5. Weekly review narrative (`AI-009`).
6. Proactive hydration/protein pacing nudges (`NUTRI-009`).
7. Meal photo → confidence-scored macros with one-tap correction.
8. Learned personal food library from corrections.
9. Natural-language logging ("אכלתי סלמון וסלט") as a typing replacement.
10. Voice logging during workouts (`AI-008`).
11. Auto-substitution suggestions when equipment is occupied (`LIBRARY-006`).
12. Injury-aware exercise filtering from health logs (`PROFILE-006`).
13. Deload detection and recommendation (`PLANNER-005`).
14. Plateau detection per exercise.
15. Sleep-debt narrative tied to shift cycle.
16. Pain-trend correlation with training gaps (already prototyped in `coach-memory.ts` — productize it).
17. Medical document extraction into a structured health vault.
18. Blood-marker trend interpretation with safe, non-diagnostic framing.
19. Grocery/meal suggestion based on macro gaps at time-of-day.
20. Personalized rest-time recommendation from historical performance drop-off.
21. Auto-generated routine from goals + equipment + schedule.
22. Body-photo change detection with respectful framing.
23. AI-generated share cards with a highlight of the week.
24. Explainability panel showing which data points drove each recommendation.
25. Memory management UI so users can correct or delete what Viora "knows".

---

## 6. Screens ranked weakest → strongest

| Rank | Screen | State | Core problem |
| --- | --- | --- | --- |
| 1 (weakest) | Settings | Does not exist | Theme/units/notifications/privacy scattered or missing. |
| 2 | Statistics / Progress | Fragmented | Three partial views, no canonical progress story. |
| 3 | Nutrition (`nutrition.tsx` + `meals.tsx` + capture) | Duplicated | Three doors to one concept; heaviest typing burden left in the app. |
| 4 | Journal / Health / Morning Intake | Overlapping | Same subjective data, three surfaces. |
| 5 | Recovery | Implicit | Readiness is discussed in docs, not surfaced to users. |
| 6 | Export / Health Book | Heavy | 966-line generator, PDF stack shipped to all users, fragile pipeline. |
| 7 | Exercise Picker / Routine Builder | Thin | No search, weak reorder affordance, no recents. |
| 8 | Hydration Center | Redundant | Duplicates the Home water card. |
| 9 | Capture ("צילום חכם") | Ambitious, unfinished | Six capture types, uneven extraction quality and confidence signalling. |
| 10 | History | Functional | Flat list, no filtering or paging. |
| 11 | Profile | Dense | 677 lines, mixes identity, metrics, gallery and learned patterns. |
| 12 | Onboarding | Long | Correct architecture, too many steps. |
| 13 | Authentication | Adequate | Works; lacks polish, error copy and password-reset completeness review. |
| 14 | Workout Planner | Good | Recently fixed empty/error states; still needs progression awareness. |
| 15 | Workout Hub | Good | Clear entry, needs planned-vs-done clarity. |
| 16 | Home / Dashboard | Strong but overloaded | Best surface in the app and also the largest file (934 lines). |
| 17 | Developer Console | Strong | Well-gated, well-built; needs server-side role check. |
| 18 (strongest) | Workout Session + Rest Timer | Strongest | Philosophy-driven, dense, ergonomic, PR-aware. The reference implementation. |

---

## 7. Features ranked by user impact

**Tier 1 — the product stands or falls here**
1. Workout session logging loop
2. Rest timer reliability
3. Home daily summary / AI hero
4. Persistence and never losing data
5. Post-workout debrief

**Tier 2 — daily habit drivers**
6. Water logging
7. Quick meal logging
8. Progress charts and PRs
9. Shift-aware day context
10. Morning check-in

**Tier 3 — retention and depth**
11. History
12. Body photos
13. Weekly planner / routines
14. Learned patterns ("what Viora knows")
15. Health book export

**Tier 4 — differentiators, not yet load-bearing**
16. Vision capture
17. Ask Viora
18. Medical vault
19. Sharing
20. Multi-profile household

---

## 8. Recommended implementation order

| Phase | Focus | Contents |
| --- | --- | --- |
| **P0 — Stability gate** | Nothing new ships before this | Error/empty/loading kits on all routes; `errorComponent` everywhere; typed errors; unit tests for the four engines; Playwright smoke suite. |
| **P1 — Architecture debt** | Make future work cheap | Service-layer enforcement; domain folders; split 500+ line routes; `queryKeys` factory; explicit column selection; legacy schema/route retirement. |
| **P2 — Gym reliability** | The core promise | Offline queue + service worker + IndexedDB cache + optimistic set logging (`CORE-003`, `CORE-004`, `WORKOUT-015`). |
| **P3 — IA consolidation** | Reduce surface confusion | Merge nutrition entry points, merge daily-log surfaces, one Progress screen, real Settings screen, privacy/deletion. |
| **P4 — Zero typing** | The differentiator | Quick-add favourites, natural-language logging, vision confidence + corrections, one-tap water. |
| **P5 — Prescriptive coach** | Tracker → coach | Load prescription, readiness, shift-aware planning, weekly review, explainability everywhere. |
| **P6 — Performance & polish** | Launch quality | Bundle budgets, lazy-loading, virtualization, realtime, accessibility CI, reduced motion. |
| **P7 — Reach** | Post-launch | Sharing, streaks, household profiles, integrations, voice. |

---

## 9. Quick wins (< 1 hour each)

1. Add `errorComponent` to the ten most-used routes.
2. Replace `h-screen` with `h-dvh` project-wide.
3. Add `aria-label` to all icon-only buttons.
4. Add `inputMode="decimal"` + select-on-focus to gym number inputs.
5. Lazy-import `jspdf`/`html2pdf` in the export route.
6. Add `staleTime` defaults per domain in the query client.
7. Delete `sidebar.tsx` and any other unused shadcn surfaces.
8. Remove the `dev.assets` redirect shim.
9. Add `head()` metadata to the ten public-facing/major routes.
10. Add `prefers-reduced-motion` guards to celebration animations.
11. Add explicit `width`/`height` to hero and gallery images.
12. Add a retry button to the three most failure-prone reads.
13. Hebrew microcopy pass on empty states.
14. Bump `size="icon"` primary controls to `min-h-11 min-w-11`.
15. Add sticky date headers to the timeline.
16. Add an "undo" toast to set deletion.
17. Add `lang`/`dir` verification to the root document.
18. Add water logging to the one-tap bar if missing.
19. Extract rest-timer defaults and BMR constants to a constants module.
20. Add a bundle-size budget script to `package.json`.

---

## 10. High-impact features (build these next)

| Feature | Impact | Effort | Notes |
| --- | --- | --- | --- |
| Offline set logging + write queue | Very high | High | Removes the single largest failure mode in real gyms. |
| Optimistic UI on set/water/meal logging | Very high | Low | Makes the app feel instant with no backend change. |
| One canonical Progress screen | High | Medium | Consolidates three weak surfaces into the emotional payoff. |
| Load prescription with "למה?" | High | Medium | Turns Viora from tracker into coach. |
| Natural-language + one-tap logging | High | Medium | Direct path to the zero-typing goal. |
| Readiness score | High | Medium | Uniquely valuable for a shift worker. |
| Settings + privacy + deletion | High | Low | Launch blocker, cheap to build. |
| Before/after photo comparison | Medium-high | Low | Highest emotional value per line of code. |
| Realtime dashboard | Medium | Medium | Removes invalidation guesswork. |
| Weekly AI review | Medium | Medium | Drives weekly return visits. |

---

## 11. Technical debt report

| Debt | Severity | Evidence | Interest accruing |
| --- | --- | --- | --- |
| Service layer bypassed | 🔴 Critical | 20+ routes import the Supabase client directly; only 7 files use `@/services`. | Every new screen deepens the bypass. |
| God routes | 🔴 Critical | 6 files > 500 lines; dashboard 934. | Merge conflicts, untestable logic, slow iteration. |
| Missing route error boundaries | 🔴 Critical | Only `__root` and OAuth consent define one. | Any backend hiccup shows a blank screen. |
| Dual-generation schema | 🟠 High | `nutrition_entries` (`meal`/`meal_type`, `food_name`/`foods`), `workout_sets` (`workout_id`/`session_id`), legacy `workouts` table. | Every query must know which generation it reads. |
| Duplicate route families | 🟠 High | `workout-session.$workoutId` vs `workouts.session.$sessionId.*`. | Two code paths for one flow. |
| AI context duplication | 🟠 High | Five overlapping builders. | Inconsistent AI behaviour per surface. |
| `select("*")` everywhere | 🟠 High | 40+ sites. | Bandwidth and coupling to schema shape. |
| No tests | 🟠 High | Zero test files. | Every refactor is a gamble. |
| No offline/PWA | 🟠 High | No service worker references anywhere. | Product promise unmet. |
| No realtime | 🟡 Medium | Zero `postgres_changes`. | Manual invalidation complexity. |
| Errors swallowed | 🟡 Medium | Pattern previously found in the planner query. | Silent empty states, hard debugging. |
| Flat `lib/` with 36 modules | 🟡 Medium | Naming mixes engines, services and helpers. | Discoverability decay. |
| Client-only dev-console gating | 🟡 Medium | `checkIsQAUser` runs client-side. | Weak boundary, not yet a breach. |
| Missing `head()` metadata | 🟡 Medium | 4 of 30+ routes. | Shareability and SEO. |
| Unused UI surface | 🟢 Low | `sidebar.tsx`, `menubar.tsx`, `carousel.tsx` likely unused. | Bundle weight. |

---

## 12. Product Quality Score

Scored 1–10 on a launch-readiness basis (10 = ship to the public today).

| Module | Score | Rationale |
| --- | --- | --- |
| Workout Session | 8.5 | Best-in-class density, PR awareness, philosophy-aligned rest timer. Loses points for offline fragility and file size. |
| Rest Timer | 8.5 | Background-safe, draggable, non-occluding, multi-channel feedback. |
| Design System / Visual Identity | 8.0 | Coherent luxury dark RTL theme; token discipline is good. Contrast on glass needs audit. |
| Database & RLS | 8.0 | Linter-clean, all tables protected, 17 indexes. Loses points for dual-generation columns. |
| Developer Console | 7.5 | Well-gated, genuinely useful; needs server-side role verification. |
| Workout Hub & Planner | 7.0 | Recently hardened states; lacks progression awareness. |
| Home / Dashboard | 7.0 | Highest value surface, but overloaded and the largest file in the repo. |
| Media Infrastructure | 6.5 | Clean abstraction (`media-paths`, `media.service`); no caching, no variants. |
| Authentication | 6.5 | Functional and correctly gated; onboarding-adjacent polish and error copy missing. |
| AI Coach | 6.0 | Strong ideas, real persistence, but fragmented context builders and inconsistent explainability. |
| Onboarding | 6.0 | Resumable and correct; too long, no skip path. |
| Profile / Digital Twin | 6.0 | Rich data model, cluttered presentation. |
| History | 5.5 | Works, no filtering, no paging, no virtualization. |
| Vision Capture | 5.5 | Impressive scope, uneven extraction confidence and correction loop. |
| Statistics / Progress | 5.0 | Fragmented across three surfaces; no canonical view. |
| Nutrition | 5.0 | Three entry points, highest remaining typing burden. |
| Export / Health Book | 5.0 | Powerful output, heavy and fragile pipeline shipped to every user. |
| Recovery | 4.0 | Data exists; no readiness surface for the user. |
| Error Handling | 3.5 | Root boundary only; per-route boundaries absent. |
| Loading / Empty States | 3.5 | Ad hoc, inconsistent, several missing entirely. |
| Accessibility | 3.5 | RTL is correct; labels, contrast, motion and focus need systematic work. |
| Performance | 3.5 | No budgets, no virtualization, heavy libs eagerly loaded, `select("*")` everywhere. |
| Offline Behaviour | 1.0 | Does not exist. |
| Realtime | 1.0 | Does not exist. |
| Settings | 1.0 | Does not exist. |
| Testing / QA | 1.0 | No automated tests of any kind. |

**Weighted platform score: 5.4 / 10.**

Interpretation: a strong vertical (workout) attached to an unfinished platform. The gap is not features — the backlog already has ~100 registered. The gap is **reliability, consolidation and consistency**. Do P0–P3 before any Tier-4 feature work, and the same codebase scores above 8.

---

## Governance note

Every item above should be registered in `docs/product-backlog.md` with a Feature ID before implementation, per `mem://product/backlog-governance`. Items already registered there (e.g. `CORE-003`, `CORE-004`, `CORE-006`, `WORKOUT-015`, `AI-005`, `HEALTH-005`, `SETTINGS-007`) are referenced by ID rather than duplicated.
