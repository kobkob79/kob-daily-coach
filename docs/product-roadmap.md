# Viora — Development Roadmap & Sprint Queue

Companion to [Master Product Backlog](./product-backlog.md) · Version 1.0

---

## 1. Recommended implementation order (rationale)

The order below maximizes value per sprint while never implementing a feature
whose dependency is still open.

1. **Close the workout loop's data integrity** — warm-up sets and per-exercise
   progression must exist before any automatic load prescription, otherwise the
   AI learns from distorted volume.
2. **Then make the AI prescriptive** — load recommendations and readiness turn
   Viora from a tracker into a coach.
3. **Then reduce typing further** — quick-add nutrition, shift-aware planning.
4. **Then platform durability** — offline queue and PWA, which unlock reliable
   gym usage and background alerts.
5. **Then engagement & sharing** — streaks, share cards.
6. **Finally multi-profile and integrations**, which require the roles model.

---

## 2. Recommended sprint queue

| # | Sprint | Feature IDs | Outcome |
| --- | --- | --- | --- |
| 1 | Workout Data Integrity | `WORKOUT-010`, `STATS-008`, `STATS-004` | Warm-up sets excluded from records; per-exercise progression charts; weekly volume per muscle. |
| 2 | Prescriptive Coach | `WORKOUT-012`, `AI-005`, `PROFILE-005` | Effort capture, goal model, next-session load targets with "למה?". |
| 3 | Recovery Intelligence | `HEALTH-005`, `PLANNER-003` | Readiness score and shift-aware training scheduling. |
| 4 | Zero-Typing Nutrition | `NUTRI-008`, `NUTRI-009` | One-tap frequent meals, protein pacing. |
| 5 | Gym Durability | `CORE-003`, `WORKOUT-015` | Sessions survive no-signal gyms. |
| 6 | Platform Reliability | `CORE-004`, `SETTINGS-004`, `SETTINGS-007` | PWA install, permission center, privacy/deletion. |
| 7 | Session Flexibility | `LIBRARY-006`, `WORKOUT-011`, `WORKOUT-009` | Substitutions and supersets. |
| 8 | Engagement | `GAME-003`, `AI-009`, `GAME-004` | Streaks, weekly AI review, personal challenges. |
| 9 | Library Depth | `LIBRARY-004`, `LIBRARY-005`, `LIBRARY-007` | Exercise detail, custom exercises, media coverage QA. |
| 10 | Sharing | `SHARE-001`, `SHARE-002`, `STATS-009` | Share cards and muscle heat map. |
| 11 | Programming Blocks | `PLANNER-004`, `PLANNER-005`, `PROFILE-006` | Overload plans, deloads, injury-aware selection. |
| 12 | Household | `CORE-006`, `SOCIAL-001` | Multiple profiles with isolated data. |
| 13 | Ecosystem | `CORE-005`, `HEALTH-007`, `HEALTH-006` | Wearable import, blood-marker trends. |
| 14 | Voice & Future | `AI-008`, `WORKOUT-014`, `SOCIAL-002`, `GAME-005` | Hands-free coaching and coach links. |

---

## 3. Release milestones

| Milestone | Contains | Definition of done |
| --- | --- | --- |
| **M1 — Trustworthy Tracker** (Sprints 1–2) | Clean records, progression charts, prescriptive targets | Every number shown is defensible and explainable. |
| **M2 — Personal Coach** (Sprints 3–4) | Readiness, shift-aware plan, zero-typing nutrition | A normal day needs no typing at all. |
| **M3 — Always Works** (Sprints 5–6) | Offline, PWA, permissions, privacy | Full workout completable with no connectivity. |
| **M4 — Complete Gym Product** (Sprints 7–9) | Supersets, swaps, rich library | Handles real-gym constraints without workarounds. |
| **M5 — Habit & Reach** (Sprints 10–11) | Streaks, sharing, programming blocks | Users return without prompting and can share progress. |
| **M6 — Platform** (Sprints 12–14) | Household, integrations, voice | Viora is a personal operating system, not an app. |

---

## 4. Definition of Ready / Done

**Ready** — a feature may enter a sprint only when: it has an ID here, all
dependencies are `Shipped`, its UX constraint is identified, and its AI data
preconditions are satisfiable.

**Done** — implemented in Hebrew RTL with existing design tokens, no UI
redesign, status updated in `docs/product-backlog.md`, and QA-regressed against
the affected epic.
