# Team gallery: fix the build, then activate on a private bucket

## Verification result (read-only — nothing was applied or changed)

- Project ref: `dyzfauesfqzwgaunfagk`, correct production backend, not paused.
- Migration `20260826180750`: not recorded (latest recorded is `20260822153722`).
- `public.about_media`: does not exist, so none of its constraints, RLS policies, indexes, triggers, or the three RPCs exist.
- Bucket `viora-team-media`: does not exist.
- Leftover test rows or storage objects: none. The prior attempt left zero side effects.
- Lifecycle tests: not run — they depend on the missing table and bucket.

The earlier attempt stopped at bucket creation because this workspace blocks public buckets, and the migration's first statement writes to the buckets table, which the managed migration path rejects.

## Decisions I'm taking (you skipped the questions)

1. **Fix the build error now** — it blocks everything else.
2. **Private bucket with time-limited links** — this works inside the current workspace policy without asking you to change a security setting.

## Step 1 — Unblock the build

`src/components/admin/AboutMediaManager.tsx` passes a text-direction prop to the shared premium card, which does not accept it. Wrap the card in a right-to-left container instead and remove the prop from the card. Visual result is identical; no change to the shared card's contract.

## Step 2 — Activate storage and metadata

- Create `viora-team-media` as a **private** bucket, 6MB per-file limit, JPEG/PNG/WebP only.
- Apply the team-media migration with the bucket statement omitted (that part is now handled by the storage tool) and the read model adjusted for a private bucket: table, subject and path checks, one-primary-per-subject index, ordering index, limit-enforcement trigger, the primary/reorder helpers, row-level security on, public read limited to active rows, all changes restricted to the trusted server role.
- Add read access on storage objects for the trusted server role only, since links are now generated server-side.

## Step 3 — Serve images through signed links

`src/lib/about-media.ts` currently builds permanent public URLs. Replace that with time-limited signed links (one hour) created for the active rows, keeping the same returned shape so `AboutVioraPage`, `PersonStoryPage`, the home card, and the admin manager need no changes.

## Step 4 — Verify

Run a disposable lifecycle through the existing admin boundary: upload one tiny image, read it back, edit caption and alt text, set primary, reorder, replace, delete. Confirm anonymous and ordinary signed-in users cannot write. Remove every test row and object, then confirm the counts are back to zero. Typecheck, lint, and build. No deploy or publish.

## Technical notes

- Bucket creation and settings go through the storage tools, never SQL.
- The migration keeps `security invoker` on all three functions and grants execute only to the trusted server role.
- `fetchPublishedAboutMedia` moves from `getPublicUrl` to `createSignedUrls`; it stays client-callable because the read policy already allows active rows.
