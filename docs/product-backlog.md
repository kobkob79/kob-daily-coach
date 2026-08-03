# Viora — Master Product Backlog

Version 1.0 · Sprint `VIORA-PRODUCT-001` · Status: Authorized

This document is the **single source of truth** for every feature, improvement,
UX enhancement and future capability in Viora. No sprint may be planned or
implemented without referencing a Feature ID from this registry.

Companion documents:

- [Dependency Map](./product-dependency-map.md) — architecture / UX / AI dependencies
- [Development Roadmap](./product-roadmap.md) — implementation order + sprint queue
- [Workout UX Philosophy](./workout-ux-philosophy.md) — binding UX standard for workout features

---

## 1. Conventions

### Feature ID

`<EPIC-CODE>-<NNN>` — immutable once assigned. Never reuse a retired ID.

### MoSCoW category

| Category | Meaning |
| --- | --- |
| Must Have | Product is incomplete/broken without it |
| Should Have | High value, not blocking launch |
| Could Have | Valuable polish or differentiation |
| Future | Requires new platform capability or research |

### Priority

`P0` critical · `P1` high · `P2` medium · `P3` low

### Complexity

`XS` <½ day · `S` ~1 day · `M` 2–3 days · `L` ~1 week · `XL` multi-sprint

### Status

`Shipped` · `In Progress` · `Ready` (spec'd, unblocked) · `Blocked` · `Backlog` · `Merged` (folded into another ID) · `Idea`

### Owner

Agent role responsible for delivery: `Dev`, `AI`, `UX`, `QA`, `Data`, `Platform`.

---

## 2. Epic Registry

| Code | Epic | Scope | Owner |
| --- | --- | --- | --- |
| `WORKOUT` | Workout Experience | Active session, sets, rest timer, session recovery | Dev |
| `PLANNER` | Workout Planner | Programs, weekly plan, templates, scheduling | Dev |
| `LIBRARY` | Exercise Library | Exercise data, muscle groups, media system | Data |
| `AI` | AI Coach | Memory, insights, debrief, explainability | AI |
| `NUTRI` | Nutrition | Meals, vision capture, macros, education | AI |
| `HEALTH` | Recovery & Health | Sleep, pain, shifts, readiness, medical docs | Data |
| `STATS` | Statistics & Progress | Charts, PRs, volume, body metrics, exports | Dev |
| `SHARE` | Sharing | Share cards, reports, external links | Dev |
| `SOCIAL` | Social | Multi-profile household, coach/athlete links | Platform |
| `GAME` | Gamification | Streaks, badges, celebrations, score ring | UX |
| `PROFILE` | Profile & Digital Twin | Life profile, work profile, onboarding | Dev |
| `SETTINGS` | Settings & Platform | Theme, units, notifications, dev console, QA | Platform |
| `CORE` | Core Infrastructure | Data model, auth, offline, storage, performance | Platform |

---

## 3. Feature Registry

Each entry: **ID — Name** · Description · *User story* · Business value · User value · Category · Priority · Complexity · Dependencies · Status · Owner.

### 3.1 WORKOUT — Workout Experience

**WORKOUT-001 — Active session engine**
Deterministic start/resume of a session bound to a plan occurrence.
*As an athlete I want to reopen the app mid-workout and continue exactly where I stopped.*
Business: retention core loop. User: zero lost work.
Must Have · P0 · L · Deps: CORE-001 · **Shipped** · Dev

**WORKOUT-002 — Set logging UI (one-handed)**
Large inputs, auto-advance, active-set highlight and auto-scroll.
*As an athlete I want to log a set with one thumb without reading instructions.*
Business: differentiation. User: speed in the gym.
Must Have · P0 · M · Deps: WORKOUT-001 · **Shipped** · Dev

**WORKOUT-003 — Rest timer widget**
Floating, collapsible, counts up past zero, red overtime state.
Must Have · P0 · M · Deps: WORKOUT-002 · **Shipped** · Dev

**WORKOUT-004 — Background timer alerts**
Vibration + chime + system notification fired on wall-clock, survives backgrounding.
Must Have · P0 · M · Deps: WORKOUT-003, SETTINGS-004 · **Shipped** · Dev

**WORKOUT-005 — Exercise hero media**
Dynamic media resolution video → animation → image → placeholder, no hardcoded filenames.
Must Have · P1 · M · Deps: LIBRARY-003 · **Shipped** · Dev

**WORKOUT-006 — Previous vs current set strip**
Last-session performance for the same exercise + set number.
Must Have · P1 · S · Deps: WORKOUT-001, STATS-002 · **Shipped** · Dev

**WORKOUT-007 — Live PR detection & celebration**
Non-blocking banner when weight/reps/volume/e1RM records break.
Should Have · P1 · M · Deps: STATS-003 · **Shipped** · Dev

**WORKOUT-008 — Global active-workout bar**
Persistent return-to-session affordance across the app.
Must Have · P1 · S · Deps: WORKOUT-001 · **Shipped** · Dev

**WORKOUT-009 — Superset & circuit support**
Group exercises so rest and advancement follow the group, not the single set.
Should Have · P2 · L · Deps: WORKOUT-002, PLANNER-002 · Backlog · Dev

**WORKOUT-010 — Warm-up set type**
Mark sets as warm-up; excluded from volume, PRs and AI progression.
Should Have · P2 · S · Deps: WORKOUT-002, STATS-003 · Backlog · Dev

**WORKOUT-011 — In-session exercise swap**
Replace an exercise (equipment busy) with an AI-suggested same-muscle alternative.
Should Have · P2 · M · Deps: LIBRARY-002, AI-003 · Backlog · Dev

**WORKOUT-012 — RPE / RIR capture**
Optional one-tap effort rating per set feeding load recommendations.
Should Have · P2 · S · Deps: WORKOUT-002, AI-005 · Backlog · Dev

**WORKOUT-013 — Plate calculator**
Bar-loading breakdown for the target weight.
Could Have · P3 · S · Deps: WORKOUT-002, SETTINGS-002 · Backlog · Dev

**WORKOUT-014 — Voice set logging**
"Done, 60 by 10" hands-free logging.
Future · P3 · L · Deps: CORE-004, AI-008 · Idea · AI

**WORKOUT-015 — Offline session resilience**
Queue set writes locally and sync when connectivity returns.
Must Have · P1 · L · Deps: CORE-003 · Backlog · Platform

### 3.2 PLANNER — Workout Planner

**PLANNER-001 — Weekly program planner**
Assign workouts to weekdays with deterministic occurrence resolution.
Must Have · P0 · L · Deps: CORE-001 · **Shipped** · Dev

**PLANNER-002 — Reusable workout templates**
Full Body / Push / Pull etc., editable and reorderable.
Must Have · P1 · M · Deps: PLANNER-001, LIBRARY-001 · **Shipped** · Dev

**PLANNER-003 — Shift-aware scheduling**
Auto-shift training days around the 9-day Intel cycle and half-rest days.
Should Have · P1 · M · Deps: HEALTH-002, PLANNER-001 · Ready · Dev

**PLANNER-004 — Progressive overload plan**
Auto-increment target load/reps week over week per exercise.
Should Have · P1 · M · Deps: STATS-003, AI-005 · Backlog · AI

**PLANNER-005 — Mesocycle / deload blocks**
Multi-week blocks with planned deloads.
Could Have · P2 · L · Deps: PLANNER-004 · Backlog · Dev

**PLANNER-006 — Template marketplace / presets library**
Curated ready-made programs by goal and experience level.
Future · P3 · L · Deps: PLANNER-002 · Idea · Data

### 3.3 LIBRARY — Exercise Library

**LIBRARY-001 — Hebrew exercise catalog**
Exercise records with Hebrew names, muscle group and equipment.
Must Have · P0 · M · Deps: CORE-001 · **Shipped** · Data

**LIBRARY-002 — Muscle-group taxonomy & filtering**
Canonical muscle groups used across planner, stats and AI.
Must Have · P1 · S · Deps: LIBRARY-001 · **Shipped** · Data

**LIBRARY-003 — Media service (dynamic storage listing)**
Recursive listing, signing, alphabetical sort, type detection, no hardcoded names.
Must Have · P0 · L · Deps: CORE-002 · **Shipped** · Platform

**LIBRARY-004 — Exercise detail sheet**
Form cues, common mistakes, target muscles, media gallery.
Should Have · P2 · M · Deps: LIBRARY-003 · Backlog · Dev

**LIBRARY-005 — Custom user exercises**
User-created exercises with own media, private to the profile.
Should Have · P2 · M · Deps: LIBRARY-001, CORE-001 · Backlog · Dev

**LIBRARY-006 — Exercise alternatives graph**
Same-muscle substitution map powering WORKOUT-011.
Should Have · P2 · M · Deps: LIBRARY-002 · Backlog · Data

**LIBRARY-007 — Media coverage QA dashboard**
Internal report of exercises missing hero media.
Could Have · P3 · S · Deps: LIBRARY-003, SETTINGS-005 · Backlog · QA

### 3.4 AI — AI Coach

**AI-001 — Central AI memory**
One persistent memory learning from all modules.
Must Have · P0 · L · Deps: CORE-001 · **Shipped** · AI

**AI-002 — Explainable recommendations ("למה?")**
Every recommendation exposes its reasoning.
Must Have · P0 · M · Deps: AI-001 · **Shipped** · AI

**AI-003 — Home AI hero + live status**
Natural-Hebrew daily condition summary, updated after every action.
Must Have · P0 · L · Deps: AI-001, HEALTH-001 · **Shipped** · AI

**AI-004 — Post-workout debrief**
Personalized analysis from PRs, progression, completion rate, consistency; no generic motivation.
Must Have · P0 · M · Deps: WORKOUT-001, STATS-003 · **Shipped** · AI

**AI-005 — Next-session load recommendation**
Suggest weight/reps per exercise for the upcoming session.
Should Have · P1 · M · Deps: AI-004, WORKOUT-012 · Ready · AI

**AI-006 — Long-horizon pattern insights**
Cross-module correlations (e.g. pain after training gaps, sleep vs performance).
Should Have · P1 · L · Deps: AI-001, HEALTH-003 · **Shipped (v1)** · AI

**AI-007 — Ask Viora conversational coach**
Free-form Hebrew Q&A grounded in personal data.
Should Have · P1 · L · Deps: AI-001 · **Shipped (v1)** · AI

**AI-008 — Voice interaction layer**
Speech-to-text input and spoken coaching replies.
Future · P3 · XL · Deps: AI-007, CORE-004 · Idea · AI

**AI-009 — Weekly AI review**
Automatic weekly digest with wins, risks and next-week focus.
Should Have · P2 · M · Deps: AI-004, STATS-001 · Backlog · AI

**AI-010 — Memory inspection & correction UI**
"What Viora knows about me" with user edits feeding back into memory.
Should Have · P2 · M · Deps: AI-001, PROFILE-003 · **Shipped (v1)** · AI

### 3.5 NUTRI — Nutrition

**NUTRI-001 — Meal logging with photos**
Persistent meals with images and macros.
Must Have · P0 · L · Deps: CORE-001, CORE-002 · **Shipped** · Dev

**NUTRI-002 — AI vision meal analysis**
Ingredient-level detection with quantity, calories and macros.
Must Have · P0 · L · Deps: NUTRI-001, AI-001 · **Shipped** · AI

**NUTRI-003 — Meal quality score (0–100)**
Score with explicit reasons.
Should Have · P1 · M · Deps: NUTRI-002, AI-002 · **Shipped** · AI

**NUTRI-004 — Correction learning loop**
User fixes to AI estimates persist and improve future analysis.
Must Have · P1 · M · Deps: NUTRI-002, AI-001 · **Shipped** · AI

**NUTRI-005 — Hydration center**
Animated water goal + one-tap logging.
Must Have · P1 · M · Deps: CORE-001 · **Shipped** · Dev

**NUTRI-006 — Calorie & macro engine**
BMR + activity + shift + workout adjusted targets.
Must Have · P1 · M · Deps: PROFILE-001, HEALTH-002 · **Shipped** · AI

**NUTRI-007 — Barcode / label capture**
Product label OCR into structured nutrition data.
Should Have · P2 · M · Deps: NUTRI-002 · **Shipped (v1)** · AI

**NUTRI-008 — Frequent meals quick-add**
One-tap re-log of habitual meals (near-zero typing).
Should Have · P1 · S · Deps: NUTRI-001, AI-001 · Ready · Dev

**NUTRI-009 — Protein pacing coach**
Intra-day protein distribution guidance.
Could Have · P2 · S · Deps: NUTRI-006 · Backlog · AI

**NUTRI-010 — Supplement schedule & adherence**
Track supplements/medicine with reminders.
Could Have · P2 · M · Deps: HEALTH-004, SETTINGS-004 · Backlog · Dev

### 3.6 HEALTH — Recovery & Health

**HEALTH-001 — Morning check-in (dynamic)**
Sleep, mood, pain; adapts to context instead of a fixed questionnaire.
Must Have · P0 · M · Deps: CORE-001 · **Shipped** · Dev

**HEALTH-002 — Intel 9-day shift engine**
Exact repeating cycle: 2 day, 2 night, 4 off, 1 half-rest.
Must Have · P0 · M · Deps: PROFILE-002 · **Shipped** · Dev

**HEALTH-003 — Pain & symptom tracking**
Body-area pain log feeding AI correlations.
Should Have · P1 · M · Deps: HEALTH-001, AI-001 · **Shipped (v1)** · Dev

**HEALTH-004 — Medical document vault**
Blood tests, documents, medicine captured via vision and stored structured.
Should Have · P1 · L · Deps: NUTRI-002, CORE-002 · **Shipped (v1)** · Data

**HEALTH-005 — Recovery readiness score**
Composite score from sleep, shift, soreness, training load.
Should Have · P1 · M · Deps: HEALTH-001, HEALTH-002, STATS-004 · Ready · AI

**HEALTH-006 — Blood-test trend analysis**
Track markers over time with AI interpretation.
Could Have · P2 · L · Deps: HEALTH-004 · Backlog · AI

**HEALTH-007 — Wearable / Health import**
Import sleep, HR and steps from external providers.
Future · P3 · XL · Deps: CORE-005 · Idea · Platform

### 3.7 STATS — Statistics & Progress

**STATS-001 — Progress dashboard**
Weight, volume, adherence and streak charts.
Must Have · P1 · L · Deps: CORE-001 · **Shipped** · Dev

**STATS-002 — Workout history & session detail**
Chronological sessions with per-set detail.
Must Have · P0 · M · Deps: WORKOUT-001 · **Shipped** · Dev

**STATS-003 — PR engine & e1RM**
Record store per exercise for weight, reps, volume and estimated 1RM.
Must Have · P0 · M · Deps: STATS-002 · **Shipped** · Dev

**STATS-004 — Training load & volume by muscle**
Weekly tonnage and set counts per muscle group.
Should Have · P1 · M · Deps: LIBRARY-002, STATS-002 · Ready · Dev

**STATS-005 — Body progress gallery**
Chronological body photos with comparison view.
Should Have · P1 · M · Deps: CORE-002, PROFILE-003 · **Shipped** · Dev

**STATS-006 — Premium Health Book export**
Multi-page magazine-style PDF with full Hebrew RTL support.
Should Have · P1 · L · Deps: STATS-001, AI-001 · **Shipped** · Dev

**STATS-007 — CSV data export**
Hebrew-safe raw export of all modules.
Should Have · P2 · S · Deps: CORE-001 · **Shipped** · Dev

**STATS-008 — Per-exercise progression chart**
Load/volume/e1RM trend for a single exercise.
Should Have · P1 · M · Deps: STATS-003 · Backlog · Dev

**STATS-009 — Muscle heat map**
Visual body map of weekly stimulus and neglected areas.
Could Have · P2 · M · Deps: STATS-004 · Backlog · UX

### 3.8 SHARE — Sharing

**SHARE-001 — Workout share card**
Generated image summarizing a session (PRs, volume, duration).
Should Have · P2 · M · Deps: STATS-002, GAME-002 · Backlog · Dev

**SHARE-002 — Progress share card**
Shareable milestone/streak/body-progress card with privacy controls.
Could Have · P2 · M · Deps: SHARE-001, STATS-005 · Backlog · Dev

**SHARE-003 — Health Book share link**
Expiring read-only link to a generated report.
Could Have · P3 · M · Deps: STATS-006, CORE-002 · Backlog · Platform

**SHARE-004 — Program export/import**
Share a training program with another Viora user.
Future · P3 · M · Deps: PLANNER-002, SOCIAL-001 · Idea · Dev

### 3.9 SOCIAL — Social & Household

**SOCIAL-001 — Multi-profile household**
Multiple people (e.g. family members) under one installation, isolated data.
Should Have · P1 · L · Deps: PROFILE-001, CORE-001 · Ready · Platform

**SOCIAL-002 — Coach ↔ athlete link**
Read-only or write access granted to a coach.
Future · P3 · XL · Deps: SOCIAL-001, CORE-006 · Idea · Platform

**SOCIAL-003 — Shared household nutrition**
Shared meals/shopping context across household profiles.
Future · P3 · L · Deps: SOCIAL-001, NUTRI-001 · Idea · Dev

### 3.10 GAME — Gamification

**GAME-001 — Daily AI score ring**
Animated composite daily score on Home.
Must Have · P1 · M · Deps: AI-003 · **Shipped** · UX

**GAME-002 — Achievement & PR celebrations**
Staged animations for PRs, exercise and workout completion.
Should Have · P1 · M · Deps: WORKOUT-007 · **Shipped** · UX

**GAME-003 — Streaks & consistency badges**
Training, hydration and check-in streaks with badge registry.
Should Have · P1 · M · Deps: STATS-001 · Backlog · UX

**GAME-004 — Personal challenges**
Time-boxed self-set goals with progress tracking.
Could Have · P2 · M · Deps: GAME-003, AI-005 · Backlog · Dev

**GAME-005 — Level / mastery progression**
Long-term progression system per muscle group or lift.
Future · P3 · L · Deps: GAME-003, STATS-004 · Idea · UX

### 3.11 PROFILE — Profile & Digital Twin

**PROFILE-001 — Life profile**
Name, birth date, sex, height, weight; generic and multi-user ready.
Must Have · P0 · M · Deps: CORE-001 · **Shipped** · Dev

**PROFILE-002 — Work profile & shift cycle start**
Workplace, job title, work type, cycle anchor date.
Must Have · P0 · S · Deps: PROFILE-001 · **Shipped** · Dev

**PROFILE-003 — Digital twin profile screen**
Editable profile, body gallery and learned patterns in one place.
Must Have · P1 · M · Deps: PROFILE-001, AI-010 · **Shipped** · Dev

**PROFILE-004 — Resumable onboarding wizard**
Gates the app, resumes at the last completed step.
Must Have · P0 · M · Deps: PROFILE-001 · **Shipped** · Dev

**PROFILE-005 — Goal & intent model**
Explicit goal (fat loss / strength / health) driving all AI targets.
Should Have · P1 · M · Deps: PROFILE-001, AI-001 · Ready · AI

**PROFILE-006 — Injury & limitation profile**
Persistent restrictions that filter exercise selection.
Should Have · P2 · M · Deps: PROFILE-001, LIBRARY-006 · Backlog · Data

### 3.12 SETTINGS — Settings & Platform Surface

**SETTINGS-001 — Theme system**
Luxury dark tokens with theme selection; no hardcoded colors.
Must Have · P0 · M · Deps: — · **Shipped** · UX

**SETTINGS-002 — Units & locale preferences**
kg/lb, measurement units; Hebrew RTL always.
Should Have · P2 · S · Deps: PROFILE-001 · Backlog · Dev

**SETTINGS-003 — Global app shell & navigation**
Edge-to-edge glass nav, safe areas, no content hidden behind nav.
Must Have · P0 · M · Deps: SETTINGS-001 · **Shipped** · UX

**SETTINGS-004 — Notification & permission center**
Single place to grant/verify notification, vibration and camera permissions.
Should Have · P1 · M · Deps: WORKOUT-004 · Backlog · Platform

**SETTINGS-005 — Developer console**
Gated internal tools hub; first module Character Assets.
Should Have · P1 · M · Deps: LIBRARY-003 · **Shipped** · Platform

**SETTINGS-006 — QA data reset tools**
Reset onboarding/data and simulate shifts for testing.
Should Have · P2 · S · Deps: SETTINGS-005 · **Shipped** · QA

**SETTINGS-007 — Privacy & data deletion**
Full export + permanent account deletion flow.
Must Have · P1 · M · Deps: STATS-007, CORE-001 · Backlog · Platform

### 3.13 CORE — Core Infrastructure

**CORE-001 — Persistent relational data model + RLS**
Every module persisted with per-user row-level security and grants.
Must Have · P0 · XL · Deps: — · **Shipped** · Platform

**CORE-002 — Storage & signed media access**
Private buckets for meal, body, exercise and document media.
Must Have · P0 · L · Deps: CORE-001 · **Shipped** · Platform

**CORE-003 — Offline-first write queue**
Local queue + reconciliation for gym/no-signal usage.
Must Have · P1 · XL · Deps: CORE-001 · Backlog · Platform

**CORE-004 — PWA install & background capability**
Installable app, service worker, background-safe timers and notifications.
Should Have · P1 · L · Deps: SETTINGS-004 · Backlog · Platform

**CORE-005 — External integration layer**
Generic connector layer for wearables/providers.
Future · P3 · XL · Deps: CORE-001 · Idea · Platform

**CORE-006 — Role & sharing authorization model**
Separate roles table + policies enabling coach/household access.
Future · P2 · L · Deps: CORE-001 · Backlog · Platform

**CORE-007 — Performance budget & instrumentation**
Route-level load budgets, query caching rules, regression checks.
Should Have · P2 · M · Deps: — · Backlog · Platform

**CORE-008 — Error capture & health telemetry**
Central client error capture with actionable reporting.
Should Have · P2 · S · Deps: — · **Shipped (v1)** · Platform

---

## 4. Duplicate Detection & Merges

| Removed / duplicate idea | Canonical ID | Resolution |
| --- | --- | --- |
| "QA assets page", "Shiran gallery", "Character preview page" | `SETTINGS-005` | All merged into the Developer Console; no standalone QA pages. |
| "Exercise image field on exercises table" | `LIBRARY-003` | DB `image_path` is only a last-resort fallback inside the media system. |
| "Rest timer sound" / "Rest timer vibration" / "Rest notification" | `WORKOUT-004` | Single multi-channel alert feature. |
| "AI daily summary card" / "Today's condition text" | `AI-003` | One Home AI surface. |
| "Nutrition education text" | `NUTRI-002` | Part of vision analysis output, not a separate feature. |
| "PDF export" / "Health Book" / "Premium report" | `STATS-006` | Health Book supersedes the old PDF export. |
| "Water card" / "Hydration screen" | `NUTRI-005` | One hydration feature with card + center surfaces. |
| "Weekly planner" / "Program screen" | `PLANNER-001` | Same feature, two entry points. |
| "Learned patterns" / "What Viora knows about me" | `AI-010` | Single memory-inspection feature surfaced in `PROFILE-003`. |
| "Backend migration to external Supabase" | — | Not a product feature; platform-level, rejected as unsupported in-place. |

---

## 5. Governance Rules

1. Every sprint brief MUST list the Feature IDs it implements.
2. New ideas enter as `Idea` status here **before** any code is written.
3. A feature may not be implemented while any dependency is `Backlog` or `Blocked`.
4. Workout features must comply with `docs/workout-ux-philosophy.md`.
5. UI redesigns require an explicit product decision; the luxury dark RTL system is the default.
6. Status changes are recorded in this file in the same change as the implementation.
