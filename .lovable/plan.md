## Verified current state

I checked the backend storage before planning:

- Buckets that exist: `body-photos`, `exercise-images`, `meal-photos`, `profile-photos`, `vision-captures`. There is **no `exercise-assets` bucket**.
- Total objects across all buckets: 7, all under `<user-id>/...` paths. **No object matches `characters/shiran/identity/...`.**

So the uploads have not landed in this app's backend yet (different project, or bucket not created). The plan therefore creates the bucket and builds the full pipeline against it — the gallery will show its empty state until the files are uploaded, and every file that appears later shows up with zero code changes.

## What gets built

### 1. Storage bucket + read policies
- Create private bucket `exercise-assets`.
- RLS on `storage.objects`: `SELECT` for `authenticated` on `bucket_id = 'exercise-assets'` (read-only for the app; uploads stay admin/manual).

### 2. Reusable media service (`src/services/media.service.ts`)
Generic, no character or filename hardcoding:
- `listMedia({ bucket, prefix, limit, offset, search })` → wraps `storage.from(bucket).list(prefix, { limit, offset, sortBy })`, filters out folder placeholders, classifies each entry as `image | video | other` from its mimetype/extension.
- `signMedia(bucket, paths, expiresIn)` → batch `createSignedUrls` so private assets render.
- Returns typed `MediaItem { path, name, kind, size, mimeType, updatedAt, url }`.
- Pagination built in (page size 60, cursor via offset) so thousands of assets stay fast; signing happens per page only.
- Exported from `src/services/index.ts`.

### 3. Asset path registry (`src/lib/media-paths.ts`)
Single place describing namespaces, so new characters/categories are data, not code:
```text
CHARACTERS = ['shiran', 'maya', 'daniel', 'ortal']
CATEGORIES = ['identity', 'marketing', 'exercise', 'video']
mediaPrefix(character, category) -> `characters/${character}/${category}`
```

### 4. Reusable gallery component (`src/components/media/MediaGallery.tsx`)
Props: `bucket`, `prefix`, `title`. Behaviour:
- TanStack Query `useInfiniteQuery` keyed on `[bucket, prefix, page]`.
- **Loading**: skeleton grid in the existing glass/bento style.
- **Empty**: friendly Hebrew message ("עדיין אין נכסים בתיקייה הזאת").
- **Error**: Hebrew error card with retry button.
- Grid of lazy-loaded (`loading="lazy"`, `decoding="async"`) images with aspect-ratio boxes; video entries render a `<video>` with poster fallback; tap opens a full-screen viewer.
- "טען עוד" button when more pages remain.

### 5. Route `/_authenticated/media`
Hebrew RTL page "נכסים" using the existing AppShell styling (no redesign):
- Character selector chips (Shiran / Maya / Daniel / Ortal) and category chips (identity / marketing / exercise / video), both driven by the registry and stored in URL search params.
- Renders `<MediaGallery bucket="exercise-assets" prefix={mediaPrefix(character, category)} />`, defaulting to `shiran` + `identity`.
- Reachable from the profile screen (a "נכסים" link) — not added to the bottom nav, so navigation stays unchanged.
- Route-level `head()` with its own Hebrew title/description/OG tags.

### Technical notes
- All reads go through the browser Supabase client under RLS; no service-role usage, no mock data, no hardcoded filenames.
- Signed URLs cached for 1h with query `staleTime` slightly below expiry so images don't break mid-session.
- Same component + service will later serve marketing, exercise and video prefixes by passing a different `prefix`.
