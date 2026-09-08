-- Community Share Studio, Phase 1: structured post foundation +
-- "workout_result" post type (VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1).
--
-- Additive and reversible: every new column has a default that reproduces
-- the exact pre-Phase-1 behavior for every existing row (post_type
-- defaults to 'regular', audience defaults to 'public' — the same
-- read-all-authenticated behavior the old single SELECT policy gave every
-- post). Nothing here changes what an existing regular post looks like or
-- who can read it.
--
-- Only "workout_result" is wired up by application code in Phase 1.
-- "meal_result" and "achievement" are accepted by the type/check
-- constraints so a later phase doesn't need another migration just to
-- widen an enum, but no meal/achievement payload builder, UI, or feed
-- card exists yet — the envelope is future-compatible, the feature isn't
-- pre-built.

alter table public.community_posts
  add column post_type text not null default 'regular',
  add column payload jsonb,
  add column source_type text,
  add column source_id uuid,
  add column audience text not null default 'public',
  add column location_label text;

alter table public.community_posts
  add constraint community_posts_post_type_valid
    check (post_type in ('regular', 'workout_result', 'meal_result', 'achievement'));

alter table public.community_posts
  add constraint community_posts_audience_valid
    check (audience in ('public', 'followers'));

alter table public.community_posts
  add constraint community_posts_source_type_valid
    check (source_type is null or source_type in ('workout', 'meal', 'achievement'));

-- A structured post must carry a real source and a real payload; a regular
-- post is unaffected (both columns null, as they are for every row today).
alter table public.community_posts
  add constraint community_posts_structured_requires_source
    check (
      post_type = 'regular'
      or (source_type is not null and source_id is not null and payload is not null)
    );

alter table public.community_posts
  add constraint community_posts_source_type_matches_post_type
    check (
      source_type is null
      or (post_type = 'workout_result' and source_type = 'workout')
      or (post_type = 'meal_result' and source_type = 'meal')
      or (post_type = 'achievement' and source_type = 'achievement')
    );

-- The old "must have a caption or a photo" rule only makes sense for a
-- regular post — a workout_result post is fully usable with neither (its
-- content is the payload). Preserves the exact original rule for
-- post_type = 'regular', which is every row that exists today.
alter table public.community_posts
  drop constraint community_posts_has_content;
alter table public.community_posts
  add constraint community_posts_has_content
    check (
      post_type <> 'regular'
      or btrim(body) <> '' or photo_path is not null
    );

-- One active Community post per (user, source): database-level idempotency
-- so a double tap, a retried request, or two concurrent publish calls can
-- never create two posts for the same workout (or, later, meal/
-- achievement). A second insert attempt hits a unique_violation, which the
-- server-side publish function treats as "already published" and resolves
-- to the existing post instead of erroring. Regular posts (source_id null)
-- are entirely unaffected — a user can still post as many regular posts as
-- they like.
create unique index community_posts_one_per_source_idx
  on public.community_posts (user_id, source_type, source_id)
  where source_id is not null;

comment on column public.community_posts.post_type is
  'regular | workout_result | meal_result | achievement. Existing rows default to regular, matching their pre-Phase-1 behavior exactly.';
comment on column public.community_posts.payload is
  'Versioned, server-built, sanitized structured snapshot (see src/lib/community-workout-share.ts WorkoutSharePayload, version 1, for the workout_result shape). Always built server-side from the authenticated user''s own persisted data — never trusted from client input. Null for regular posts.';
comment on column public.community_posts.source_type is
  'workout | meal | achievement — what the payload was built from. Null for regular posts. No FK on purpose: source_id is polymorphic across future source tables, and the server-side publish function validates ownership by querying the source table (RLS-scoped to the caller) at publish time rather than relying on a schema-level reference.';
comment on column public.community_posts.source_id is
  'The id of the source row (e.g. workout_sessions.id for source_type = workout) this post was generated from. Null for regular posts.';
comment on column public.community_posts.audience is
  'public | followers. Existing rows default to public, matching the pre-Phase-1 read-all-authenticated behavior exactly. Enforced in the SELECT policy below, not just client-side filtering.';
comment on column public.community_posts.location_label is
  'Human-readable location only (e.g. a gym name), never GPS coordinates. Null (not shown) unless the author explicitly opts in for that specific post — never inherited from a previous post''s choice.';

-- Audience enforcement moves from the DB (RLS), not just client
-- filtering: everyone can read a public post, only the author and their
-- followers can read a followers-only post, and an author can always read
-- their own post regardless of audience.
drop policy "Authenticated users read all community posts" on public.community_posts;

create policy "Read own, public, or followed-author posts"
  on public.community_posts for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or audience = 'public'
    or (
      audience = 'followers'
      and exists (
        select 1 from public.user_follows
        where follower_id = (select auth.uid())
          and followed_id = community_posts.user_id
      )
    )
  );

comment on table public.community_posts is
  'Public-within-app feed posts. author_display_name/author_avatar_path are point-in-time snapshots, not a live profile join. post_type=regular rows behave exactly as the pre-Phase-1 schema did.';

-- SECURITY FIX (Codex review, VIORA-COMMUNITY-SHARE-STUDIO-PHASE-1):
-- the INSERT/UPDATE policies above only ever checked ownership and photo-
-- path prefix — nothing stopped an authenticated client from inserting a
-- row with post_type='workout_result' and an arbitrary, self-authored
-- payload directly, completely bypassing publishWorkoutShareResult()'s
-- server-side metric computation and ownership/completion checks. A
-- structured post can now ONLY be created through the trusted server path
-- (community-workout-share.server.ts), which writes via `supabaseAdmin`
-- (src/integrations/supabase/client.server.ts — an existing, already-
-- configured service-role client already used the same way by
-- health-sync.server.ts) after computing the payload itself from the
-- caller's own RLS-scoped, ownership-verified session data. The
-- service_role Postgres role bypasses RLS by design (Supabase sets
-- BYPASSRLS on it), so no new policy is needed to let that path through —
-- only the authenticated-role policies below need tightening.
drop policy "Users create own community posts" on public.community_posts;
create policy "Users create own regular community posts"
  on public.community_posts for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and post_type = 'regular'
    and (photo_path is null or photo_path like ((select auth.uid())::text || '/%'))
    and (
      author_avatar_path is null
      or author_avatar_path like ((select auth.uid())::text || '/%')
    )
  );

drop policy "Users update own community posts" on public.community_posts;
create policy "Users update own regular community posts"
  on public.community_posts for update
  to authenticated
  using ((select auth.uid()) = user_id and post_type = 'regular')
  with check (
    (select auth.uid()) = user_id
    and post_type = 'regular'
    and (photo_path is null or photo_path like ((select auth.uid())::text || '/%'))
    and (
      author_avatar_path is null
      or author_avatar_path like ((select auth.uid())::text || '/%')
    )
  );

comment on policy "Users create own regular community posts" on public.community_posts is
  'Direct client inserts are only ever allowed for post_type=regular. A structured post (workout_result/meal_result/achievement) can only be written by the service-role publish path, which computes and verifies the payload server-side first.';

-- SECURITY FIX (Codex review, finding 11): the original storage read policy
-- granted every authenticated user read access to every file in the
-- bucket, independent of the owning post's audience — so a followers-only
-- post's photo (or a regular post's avatar snapshot) was effectively
-- public to anyone who obtained its path, even though the post ROW itself
-- was correctly hidden from non-followers. Gate photo reads on the same
-- audience rule as the post row.
drop policy "Authenticated users read community post photos" on storage.objects;

create policy "Read community post photos per post audience"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'community-post-photos'
    and exists (
      select 1
      from public.community_posts p
      where (p.photo_path = storage.objects.name or p.author_avatar_path = storage.objects.name)
        and (
          p.user_id = (select auth.uid())
          or p.audience = 'public'
          or (
            p.audience = 'followers'
            and exists (
              select 1 from public.user_follows f
              where f.follower_id = (select auth.uid()) and f.followed_id = p.user_id
            )
          )
        )
    )
  );

comment on policy "Read community post photos per post audience" on storage.objects is
  'A photo is only readable when the community_posts row referencing it (by photo_path or author_avatar_path) is readable under the same public/followers/own-post audience rule as the post row itself — closes the gap where knowing a path alone was enough to read a followers-only photo.';

-- Server-authored debrief snapshot (Codex review, findings 3+4): the
-- Coach Debrief was previously only ever held in the client's React Query
-- cache, so there was no authoritative server-side copy to trust — the
-- Share Studio's publish request had to accept the debrief text FROM the
-- client, which meant a user could submit fabricated "coach" text under
-- Viora's own byline. This table gives the server something real to read
-- instead: every successful AI debrief generation for a session is
-- persisted here (upserted — the latest generation wins, matching what
-- the debrief screen itself last showed the user), and both the Share
-- Studio's live preview and the publish path read ONLY this row, never
-- client-supplied narrative text. Regenerating a debrief is unaffected —
-- this just also remembers the last successful result.
create table public.workout_debriefs (
  session_id uuid primary key references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  greeting text not null,
  paragraphs text[] not null default '{}',
  highlights text[] not null default '{}',
  next_focus text,
  recovery text,
  nutrition text,
  hydration text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workout_debriefs enable row level security;

create policy "Users manage own workout debriefs"
  on public.workout_debriefs for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.workout_debriefs from public, anon;
grant select, insert, update, delete on public.workout_debriefs to authenticated;
grant all on public.workout_debriefs to service_role;

create trigger workout_debriefs_touch
before update on public.workout_debriefs
for each row execute function public.touch_updated_at();

comment on table public.workout_debriefs is
  'Server-authored snapshot of the most recent successful Coach Debrief generation for a session — the sole trusted source for any "coach" text shown in a Community share (Share Studio and the publish path both read this, never client-supplied narrative text).';
