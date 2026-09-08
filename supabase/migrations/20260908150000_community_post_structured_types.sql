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
