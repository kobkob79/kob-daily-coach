## Goal

Turn the current Shiran-oriented media library into a generic, reusable character asset layer driven by Supabase Storage, and move the browsing UI to a hidden internal QA page instead of a permanent app route.

## What exists today (verified)

- `src/lib/media-paths.ts` — already a registry: `characters/<characterId>/<category>`, with characters `shiran / maya / daniel / ortal` and categories `identity / marketing / exercise / video`. No hardcoded filenames.
- `src/services/media.service.ts` — already bucket/prefix-agnostic, paginated listing + batch signed URLs + mimetype classification.
- `src/components/media/MediaGallery.tsx` — reusable grid with Hebrew loading/empty/error states and a fullscreen viewer.
- `src/routes/_authenticated/media.tsx` — a public-ish route with character/category chips, linked from the profile screen.

So the service layer is fine; the gap is (a) no reusable component for consuming a *single* asset inside ordinary screens, and (b) the gallery is a linked app route rather than a hidden dev tool.

## Changes

1. **Reusable asset component + hook**
   - `src/components/media/CharacterAsset.tsx`: `<CharacterAsset characterId category name? index? className? alt? />` — resolves and renders one image/video from a character folder, with skeleton, error fallback and empty fallback. Any screen can drop this in.
   - `src/hooks/useCharacterAssets.ts`: `useCharacterAssets({ characterId, category })` returning typed `MediaItem[]` via React Query (single query key, shared cache, signed-URL TTL respected). Both build on the existing service — no duplicate Storage logic.
   - `MediaGallery` gets `characterId` + `category` props (instead of raw bucket/prefix at call sites) while keeping the generic prefix escape hatch.

2. **Hidden internal QA/dev page**
   - Move the browsing UI to `src/routes/_authenticated/dev.assets.tsx` (path `/dev/assets`), `noindex` meta, no entry in `AppShell` bottom nav.
   - Keep the character/category chips, driven entirely by the registry so new characters/categories appear automatically.
   - Reachable only from the existing hidden QA/Developer tools card (`src/components/qa/QAToolsCard.tsx`).
   - Delete `src/routes/_authenticated/media.tsx` and remove the "ספריית הנכסים" link from `profile.tsx`.

3. **Registry cleanup**
   - Rename the character constant to a generic `CHARACTER_IDS` / `CharacterId` and mark Shiran as the only currently-populated dataset (a `populated` flag, so QA chips can show which folders have content). No filenames anywhere.

## Notes

- Shiran remains the initial dataset; Maya/Daniel/Ortal and future characters need only a registry entry plus uploads.
- Bucket stays private; access continues through short-lived signed URLs and the authenticated-only SELECT policy.
- No visual redesign, everything stays Hebrew RTL.
