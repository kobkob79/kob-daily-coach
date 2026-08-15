# Media Inbox Diagnosis — Root Cause and Minimal Fix

## Short answer

The Lovable-hosted app is not "pointing at the wrong project by mistake". It is bound to the backend that holds all of Viora's real data, and that backend simply has no `media-inbox` bucket — which is exactly why the phone shows `Bucket not found`. The bucket was created in a different, unrelated backend project. The correct fix is to create the bucket and its owner-scoped policies in the app's real backend. Switching the app to the other project would be a data-loss-class change and should not be done.

## A + B: Where the connection values come from

- The Lovable project is bound to one managed backend (internal ref `dyzfauesfqzwgaunfagk`). That binding is Lovable-managed platform state, not a repo file.
- Preview and published builds read it from platform-injected env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (server-side twins without the `VITE_` prefix). The `.env` file in the repo is an auto-generated mirror of that binding — editing it locally changes nothing for preview/published builds, which is why the local swap had no effect on the phone.
- `src/integrations/supabase/client.ts` reads only those env vars. No hardcoded URL anywhere in app code.
- So there is no bug to fix here: the value is `dyzfauesfqzwgaunfagk` because that is the project this Lovable app is actually connected to.

## C: Is switching to the other backend safe? No.

Verified in the currently connected backend right now:

- 3 auth users
- 37 nutrition entries (real meal history)
- 16 storage objects across 6 buckets: `meal-photos`, `vision-captures`, `profile-photos`, `body-photos`, `exercise-images`, `exercise-assets`
- 20+ owner-scoped storage policies, plus all app tables, triggers, functions (`handle_new_user`, `increment_meal_favorite_use`, `touch_updated_at`) and the nutrient/medical/workout schema built over the last sprints

Repointing the app at `hvrdnezixxdkpjgroezn` would mean: login breaks (auth users do not transfer, so Kobi becomes a brand-new user), every screen reads empty tables, all uploaded photos become unreachable, Google OAuth needs reconfiguration, and the Lovable-managed integration/migration history no longer matches the live database. That is a full migration project, not a config toggle — and it buys nothing, because the only thing missing in the current backend is one bucket.

Recommendation: keep the current backend. Treat `hvrdnezixxdkpjgroezn` as a stray/experimental project.

## D: Media Inbox code path

Once `media-inbox` exists in the connected backend with owner-scoped policies, the path is sound:

- `uploadMediaInboxFile` writes to `media-inbox/<user.id>/<timestamp>-<safeName>.<ext>` — first path segment is the user id, which is what `storage.foldername(name)[1] = auth.uid()::text` policies expect (same pattern already used by `meal-photos`/`body-photos`).
- `MediaGallery` lists with `queryKey ["media-tree", bucket, prefix]` where `prefix = userId`, and `MediaInboxCard` invalidates the identical key — cache refresh after upload is correct.
- Signed URLs are used (private bucket) — correct.

One real (non-blocking) bug: in `MediaInboxCard`, `userId` is only ever set inside `ensureUser()`, which runs during an upload. On a fresh Profile visit the gallery section is not rendered at all, so previously uploaded images stay invisible until the user uploads again. Fix by resolving the user on mount (as `media-inbox.tsx` already does with a `useEffect`).

## E: `/auth` 404

Not a production problem. The route file `src/routes/auth.tsx` exists, `src/routeTree.gen.ts` already contains `AuthRoute` / `/auth`, and the server returns 200 with full auth HTML. The 404 seen locally came from a stale/hand-generated route tree plus the local-only Vite config workaround — a local tooling mismatch. Nothing to change in the repo; do not hand-run the router CLI and do not commit generated route-tree churn (Vite regenerates it during dev/build).

## F: Minimal implementation plan, safest first

1. Create the `media-inbox` bucket (private) in the currently connected backend. Platform tool call, no file edits.
2. Add owner-scoped RLS policies on `storage.objects` for `bucket_id = 'media-inbox'` (SELECT / INSERT / UPDATE / DELETE, all gated on `storage.foldername(name)[1] = auth.uid()::text`), mirroring the existing `body-photos` policy set. One migration file.
3. Verify on the phone: Profile > Media Inbox > Gallery uploads one image and it appears in the grid.
4. Only if step 3 shows the "images invisible until upload" symptom: resolve the user on mount in `src/components/media/MediaInboxCard.tsx` (one small edit).

Files/settings that would change: one new storage bucket, one new migration under `supabase/migrations/`, and optionally `src/components/media/MediaInboxCard.tsx`.

## G: What I would NOT change

- The Lovable backend connection (no switch to `hvrdnezixxdkpjgroezn`).
- `.env`, `src/integrations/supabase/client.ts`, `src/routeTree.gen.ts`, `vite.config.ts`, `package-lock.json`.
- Existing tables, policies, buckets, auth users, Google OAuth configuration.
- `src/routes/_authenticated/media-inbox.tsx` (kept as-is; Profile embedding stays the primary path).
- No data migration between backends, no `git add .`.
