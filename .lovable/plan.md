# Viora Developer Console — Implementation Plan

## Goal
Replace the one-off QA asset page with a permanent, dev-only Developer Console at `/dev` that hosts all future internal tools. First module: Character Assets, reading dynamically from Supabase Storage.

## 1. Access & visibility rules
Three independent gates, all must pass:

1. **Build-time gate** — `import.meta.env.DEV` (plus an optional `VITE_ENABLE_DEV_CONSOLE` escape hatch for preview testing). In a production build the console modules are behind a lazy dynamic import that is never reached, so nothing meaningful ships to real users.
2. **Route gate** — the console lives under the existing `_authenticated` layout, so signing in is still required.
3. **Identity gate** — reuse `checkIsQAUser()` from `src/lib/qa.ts` (owner/tester email). Failing any gate renders a plain "Not available" screen, never a redirect loop.

No entry appears in the bottom nav or profile. Entry point stays the QA tools card, which itself only renders for QA users.

## 2. Route structure
```text
src/routes/_authenticated/dev.tsx            -> layout: gate + console chrome + <Outlet/>
src/routes/_authenticated/dev.index.tsx      -> module launcher grid
src/routes/_authenticated/dev.characters.tsx -> Character Assets module
(future) dev.storage.tsx, dev.prompts.tsx, dev.qa.tsx, dev.ai.tsx, dev.db.tsx, dev.health.tsx
```
The existing `dev.assets.tsx` becomes `dev.characters.tsx`; the old path keeps working via a redirect route so the QA card link never breaks.

All console routes declare `head()` with `robots: noindex, nofollow`.

## 3. Module registry (the extensibility mechanism)
`src/lib/dev-console.ts` exports a typed array of module descriptors:

- `id`, Hebrew `title`, one-line `description`, lucide `icon`
- `to` (route path) and `status`: `"ready" | "planned"`
- optional `requires` flag (e.g. storage, AI gateway)

The launcher renders this array: ready modules are links, planned modules are dimmed non-clickable tiles. Adding a future tool = one registry entry + one route file. The ten listed modules are all seeded now, with only Character Assets marked `ready`.

## 4. Console chrome (reuses existing design system only — no redesign)
`src/components/dev/DevConsoleShell.tsx`: RTL header with "קונסולת מפתחים", a `DEV` badge in warning colors, back link, and a horizontal module switcher. Built from existing `PremiumCard` / `SectionHeader` / `Button` primitives so the luxury dark glass style is untouched.

## 5. Character Assets module
Reuses the media layer already built — no new storage logic:

- Character chips from `CHARACTER_IDS` / `CHARACTER_LABELS`; characters without assets shown muted via `POPULATED_CHARACTERS`.
- Category chips from `ASSET_CATEGORIES` (identity / marketing / exercise / video) with Hebrew labels.
- Selection is held in URL search params (`character`, `category`, optional `q` search, optional `subfolder`) so states are shareable and refresh-safe.
- Assets render through `MediaGallery` → `useCharacterAssets` → `listMediaTree`, which already: reads from Storage recursively, never hardcodes filenames, sorts alphabetically by full path, detects type from mimetype/extension, batch-signs URLs, and groups by nested folder.
- States: skeleton grid while loading, Hebrew empty state naming the exact storage prefix, error card with a retry button, and per-tile skeleton/error placeholders.
- Newly uploaded files appear automatically; a "רענן" button invalidates the query, and the query's staleTime stays inside the signed-URL lifetime.
- Footer shows the resolved prefix `characters/<id>/<category>` plus asset count for debugging.

## 6. Cleanup
- `QAToolsCard` link points at the console root instead of the asset page; the asset link becomes one tile inside the console.
- No changes to `media-paths.ts`, `media.service.ts`, `useCharacterAssets.ts`, or `MediaGallery.tsx` beyond prop pass-through — the media layer is already generic.

## Technical notes
- Files touched: new `src/lib/dev-console.ts`, new `src/components/dev/DevConsoleShell.tsx`, new `dev.tsx` + `dev.index.tsx`, rename `dev.assets.tsx` → `dev.characters.tsx` (+ redirect stub), small edit to `QAToolsCard.tsx`.
- Heavy module bodies are `React.lazy`-imported from the route so production bundles don't carry console UI.
- No database migration, no new bucket, no RLS change: `exercise-assets` and its authenticated-read policy already exist.
- Hebrew RTL throughout; existing tokens only, zero visual-style changes.

## Out of scope for this sprint
The nine remaining modules ship as `planned` tiles only — no partial implementations.
