# Viora — Dependency Map

Companion to [Master Product Backlog](./product-backlog.md) · Version 1.0

---

## 1. Architectural dependencies

```text
CORE-001 (data model + RLS)
├── CORE-002 (storage/signed media)
│   ├── LIBRARY-003 (media service) ──> WORKOUT-005, LIBRARY-004/005/007, SETTINGS-005
│   ├── NUTRI-001 (meal photos)
│   ├── STATS-005 (body gallery)
│   └── HEALTH-004 (medical vault)
├── PROFILE-001 ──> PROFILE-002/003/004/005/006, NUTRI-006, SOCIAL-001
├── WORKOUT-001 ──> WORKOUT-002..008, STATS-002 ──> STATS-003 ──> STATS-004/008, AI-004
├── PLANNER-001 ──> PLANNER-002 ──> PLANNER-004 ──> PLANNER-005
├── HEALTH-001/002 ──> HEALTH-003/005, PLANNER-003, NUTRI-006
├── AI-001 ──> AI-002..010, NUTRI-002/004
├── CORE-003 (offline queue) ──> WORKOUT-015
├── CORE-006 (roles) ──> SOCIAL-001/002, SHARE-003
└── CORE-005 (integrations) ──> HEALTH-007
```

**Hard architectural blockers**

| Blocked feature | Waiting on | Reason |
| --- | --- | --- |
| `WORKOUT-015` | `CORE-003` | Needs a local write queue before session writes can be deferred. |
| `WORKOUT-004` (hardening) | `CORE-004` | Reliable background alerts need a service worker. |
| `SOCIAL-001/002`, `SHARE-003` | `CORE-006` | Cross-profile access requires a separate roles table and policies. |
| `HEALTH-007` | `CORE-005` | No provider connector layer exists yet. |
| `PLANNER-005` | `PLANNER-004` | Deloads are meaningless without progression targets. |

---

## 2. UX dependencies

| Feature | UX prerequisite | Constraint |
| --- | --- | --- |
| All workout features | `docs/workout-ux-philosophy.md` | Minimal interruption, silent AI in-session, analysis after the workout. |
| `WORKOUT-009`, `WORKOUT-012` | `WORKOUT-002` | Must not add taps to the core set-logging loop. |
| Any floating surface (rest timer, active bar, PR banner) | `SETTINGS-003` | Nav height is measured; floating stacks must never occlude data. |
| `GAME-002/003`, `WORKOUT-007` | `SETTINGS-001` | Celebrations use existing motion + token system; respect reduced motion. |
| `STATS-009`, `SHARE-001/002` | `SETTINGS-001` | Semantic tokens only; no hardcoded colors, RTL-correct composition. |
| `NUTRI-008`, `WORKOUT-014` | Near-zero-typing principle | Every new input must offer a one-tap path. |
| `SETTINGS-004` | `WORKOUT-004`, `NUTRI-002` | Permissions must be requested in context, then centrally reviewable. |

---

## 3. AI dependencies

| Feature | Requires from AI layer | Data preconditions |
| --- | --- | --- |
| `AI-004` post-workout debrief | Personal-record + progression context | ≥2 sessions of the same exercise (`STATS-003`) |
| `AI-005` load recommendation | Debrief context + effort signal | `WORKOUT-012` RPE improves quality; degrades gracefully without it |
| `AI-006` pattern insights | Central memory with cross-module timestamps | ≥14 days of logs across modules |
| `AI-009` weekly review | Aggregated weekly stats | `STATS-001`, `STATS-004` |
| `HEALTH-005` readiness | Sleep + shift + load features | `HEALTH-001/002`, `STATS-004` |
| `NUTRI-002/003/007` | Vision model + structured extraction schema | Image storage (`CORE-002`) |
| `NUTRI-004` correction loop | Writable memory keyed per user | `AI-001` |
| `PLANNER-004` overload | Progression model per exercise | `STATS-003`, `STATS-008` |
| `AI-008` voice | Speech-to-text + TTS | `AI-007` grounded answers first |

**AI invariants**

1. All AI output is Hebrew, natural, non-generic; no motivational filler.
2. Every recommendation carries a "למה?" explanation (`AI-002`).
3. Default scope is today's data unless the user explicitly asks for history.
4. AI never interrupts an active set — insights surface after the workout.
5. All AI features read from and write to the single central memory (`AI-001`).

---

## 4. Risk register

| Risk | Affected IDs | Mitigation |
| --- | --- | --- |
| Media coverage gaps make hero sections look empty | `WORKOUT-005` | `LIBRARY-007` coverage report; placeholder never breaks layout. |
| Volume/PR distortion from warm-ups | `STATS-003`, `AI-004` | Ship `WORKOUT-010` before advanced progression features. |
| Background alerts unreliable on iOS web | `WORKOUT-004` | Wall-clock timeout + visibility recheck today; `CORE-004` for durability. |
| Multi-profile added late causes data-model churn | `SOCIAL-001` | Keep every table profile-scoped from now on. |
| Cross-module AI cost/latency growth | `AI-006`, `AI-009` | Precompute aggregates in `STATS-004`; cache daily context. |
