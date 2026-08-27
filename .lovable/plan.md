# About Media: verification result and next steps

## Verification report (read-only, nothing was applied or changed)

1. **Project ref** — `dyzfauesfqzwgaunfagk`. Matches the expected production project. Managed backend, not paused.
2. **Migration `20260826180750`** — not recorded. It appears zero times in migration history; the latest recorded version is `20260822153722`.
3. **`public.about_media`** — does not exist. Therefore none of its constraints, RLS policies, indexes, triggers, or the RPCs `set_about_media_primary`, `reorder_about_media`, `validate_about_media_limits` exist either (0 matching functions, 0 policies).
4. **Bucket `viora-team-media`** — does not exist. Public read / admin-only mutation configuration is therefore not present.
5. **Leftover test data** — none. 0 storage objects under that bucket id, and no table to hold rows. The prior attempt left zero side effects.
6. **Lifecycle tests** — not completed. They depend on the bucket and table, neither of which exists. No evidence of any upload, metadata read, caption/alt update, primary set, replace, delete, or unauthorized-write rejection test having run.

The earlier attempt stopped at bucket creation: the workspace policy rejects public buckets (`public_buckets_blocked`), and the migration file's first statement is an `insert into storage.buckets`, which the managed migration path does not accept. Nothing after that point ran.

## Outstanding blocker: public bucket policy

The migration and `src/lib/about-media.ts` both assume a **public** bucket (`getPublicUrl`). This workspace forbids public buckets, so activation cannot proceed as written. Two directions:

- **Option A — enable public buckets** for this workspace, then activate unchanged (bucket via the storage tool, remaining SQL as the migration).
- **Option B — switch About media to a private bucket with signed URLs**: private `viora-team-media` with a 6MB limit and the JPEG/PNG/WebP allowlist, storage RLS granting reads only to the server boundary, and `fetchPublishedAboutMedia` returning signed URLs instead of public ones. This is a code change to `src/lib/about-media.ts` plus the migration's bucket/policy section.

## Also outstanding: build error

`src/components/admin/AboutMediaManager.tsx:129` passes `dir="rtl"` to `PremiumCard`, whose props (`children`, `className`, `as`, `interactive`) do not include `dir` — TS2322.

Fix, minimal and visual-parity preserving: wrap the card in a `<div dir="rtl">`, or drop `dir="rtl"` from `PremiumCard` and place it on the inner content wrapper. Do not widen `PremiumCardProps` unless we want `dir` available across every premium card.

## What I need from you

Confirm which activation direction (A or B), and confirm you want the `AboutMediaManager` type error fixed now — it is a code edit, which the previous instructions forbade.
