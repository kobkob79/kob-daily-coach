## AppShell + Bottom Navigation Redesign — Edge-to-Edge Navigation

### 1. Current AppShell analysis
`src/components/AppShell.tsx` renders, in order:
- Fixed decorative aura layer (`z-0`), sticky glass header (`z-40`), `<main>` (`max-w-2xl`, `z-10`), and a `fixed inset-x-0 bottom-0` nav (`z-40`).
- The nav is a floating pill: `mx-auto max-w-2xl px-3 pb-3` wrapper with `rounded-[28px] border bg-card/85 backdrop-blur-2xl shadow-soft`.
- Tabs come from `liveModules().filter(m => m.route)`, split in half around a center AI button that is pulled up (`-mt-8`, 64px circle, breathing glow) and opens `AskVioraSheet`.
- `ActiveWorkoutBar` sits inside the same wrapper, stacked above the pill.
- Nav height is measured at runtime (`ResizeObserver` + resize listener) and applied as `<main>` bottom padding (`navHeight + 32`).
- Nav is hidden entirely on `/workouts/session/*` (`hideBottomNav`), where padding drops to 16.

### 2. Floating navigation — pros and cons
Advantages
- Reads as "premium object", matches the glass/bento identity already in `styles.css`.
- The overhanging AI button feels deliberate and gives the brand a single unmistakable focal point.
- Content visibly continues beneath it, which reinforces depth.

Disadvantages
- Fragile geometry: pill + gap + active-workout strip + overhanging button + safe-area inset makes real height unpredictable, which is why runtime measurement was needed at all.
- Wastes ~14–18px of horizontal reach on each side; tab hit targets are smaller than the thumb zone allows on a 384px viewport.
- The overhang means the AI button visually collides with the last card on dense screens.
- Two rounded surfaces (workout strip + pill) compete for attention.
- Bottom corners are dead zones, which feels less native than the system-level bars users know from Hevy/Strava/Apple.

### 3. Proposed architecture — full-width navigation
Structural target (Viora identity preserved, geometry simplified):

```text
┌──────────────────────────────────────┐
│ header (sticky, glass)               │
│ main (scroll)                        │
│ ── ActiveWorkoutBar (floating,       │
│      sits directly above nav)        │
├──────────────────────────────────────┤ 1px hairline top border
│  tab  tab   [ AI ]   tab  tab        │  edge-to-edge glass bar
│  (safe-area padding below)            │
└──────────────────────────────────────┘
```

- Nav becomes a full-bleed bar: no horizontal margin, no outer radius, `border-t` hairline, same `bg-card/85 backdrop-blur-2xl` glass so the visual language is unchanged.
- Inner row keeps `mx-auto max-w-2xl` so tablet/desktop tabs stay centred while the glass still bleeds to both edges.
- Fixed content height for the tab row (single source of truth constant, e.g. 60px) + safe-area padding; this makes height deterministic.
- Tabs become equal-width flex children with full-height tap targets (edge-to-edge means the outermost tabs gain the previously dead corner area).
- Active state stays Viora's lime treatment, but shifts from a filled pill behind the icon to a lighter icon-glow + a short top indicator bar, which reads better in a squared bar.

### 4. Safe-area handling
- Keep `pb-[env(safe-area-inset-bottom)]` on the nav container, but now the glass background extends into the inset area (currently the inset is transparent gap), removing the "floating above a colored strip" artifact on iOS.
- `<main>` bottom padding stays measured (ResizeObserver already in place) — it becomes more reliable because the bar height no longer changes with the overhang.
- Header keeps `sticky top-0`; no `env(safe-area-inset-top)` change is proposed unless status-bar overlap is reported.

### 5. AI center action placement
Two options; recommendation is A.

A. Recessed center tab (recommended) — the AI action lives inside the bar as a slightly larger circular lime button, vertically centred, no overhang (or a minimal 6–8px raise). Keeps deterministic height, keeps the AI unmistakable, removes collision with page content, matches full-bleed philosophy.

B. Retained overhang — 56–64px circle still breaking the top edge of the bar. Maximum brand drama, but reintroduces the geometry fragility and the content collision that motivated this redesign.

Either way, behaviour is untouched: opens `AskVioraSheet` with the current pathname as context.

### 6. Layout implications per screen
- All `_authenticated/*` screens inherit `<main>` padding from the same measurement, so no per-route padding edits are expected.
- Dashboard: the bento grid's last row gains clean clearance; the previous overhang shadow no longer lands on a card.
- Hydration / capture / journal: full-width bar removes the side gaps where scrollable rows previously appeared to slide under nothing.
- `/workouts/session/*`: unchanged — nav still hidden, padding still 16.
- `ActiveWorkoutBar` stays a floating rounded strip immediately above the bar, now clearly one level "above" the flat nav instead of a sibling pill.
- Sheets/dialogs (`AskVioraSheet`, `AssignDayDialog`) keep their own bottom safe-area padding; z-order relative to nav must remain above.

### 7. Required component changes
- `src/components/AppShell.tsx` — nav container classes (remove `max-w-2xl px-3 pb-3` wrapper radius, add full-bleed + `border-t`), inner centred row, tab sizing, AI button placement, keep measurement effect.
- `NavTab` (same file) — squared-bar active treatment: top indicator, icon glow, equal-width `flex-1`, taller tap area.
- `src/components/ActiveWorkoutBar.tsx` — margin/radius tweak only so it reads as floating above the flat bar; no logic change.
- `src/styles.css` — optionally add tokens for nav height and nav surface/hairline so values aren't duplicated.
- No changes to `liveModules()`, routing, data, Supabase, or onboarding.

### 8. Risks
- Full-bleed glass can read "generic" if the hairline and blur aren't tuned — mitigated by keeping Viora's lime active state and card glass token.
- Removing the overhang reduces the AI button's dominance; if it feels too quiet, fall back to option B's small raise.
- Nav height constant plus measurement could drift if both are trusted; measurement stays the single source of truth for padding.
- Light theme: `border-t` hairline and `bg-card/85` need a check in both themes for contrast against the page background.
- Landscape / short viewports: fixed 60px row must not eat too much height; verify at 384×624 and shorter.

### 9. Migration strategy
1. Decide AI placement (A or B) before touching classes.
2. Introduce nav surface + height tokens in `styles.css`.
3. Convert the nav container to full-bleed with the centred inner row; leave tabs and AI untouched.
4. Restyle `NavTab` for the squared bar.
5. Reposition the AI button per the chosen option.
6. Adjust `ActiveWorkoutBar` spacing.
7. Verify measured padding still matches on Home, hydration, workouts hub, and an active session.
- Single-commit, purely presentational; revertable by restoring `AppShell.tsx`.

### 10. QA checklist
- 384×624 Home: scroll to bottom, last element fully visible above the nav; no content under the bar.
- Same at 390×844 and a short landscape viewport.
- iOS-style safe-area inset: glass fills the inset, no transparent strip, tabs not pushed off-centre.
- Active tab highlight correct on every module route, including nested paths (`/workouts/program`, `/workouts/history`).
- AI button opens the sheet; sheet renders above the nav; context label shows the right screen.
- Start a workout → `ActiveWorkoutBar` appears, `<main>` padding grows, no overlap; tap it → navigates to the session.
- `/workouts/session/*`: nav hidden, no leftover blank space at the bottom.
- Light and dark theme both pass hairline/contrast; RTL order of tabs unchanged.
- Outermost tabs tappable at the very screen edges.
