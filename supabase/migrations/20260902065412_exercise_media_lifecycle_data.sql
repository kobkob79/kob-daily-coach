-- Exercise Media V2 lifecycle — database foundation only.
--
-- Three normalized tables back the Hero Cover / Motion Video pipeline:
--   1. exercise_media_versions      — one curated media package per exercise version.
--   2. exercise_media_assets        — the hero_cover / motion_video files inside a version.
--   3. exercise_media_asset_events  — append-only lifecycle/QA audit trail.
--
-- This migration adds no application behavior: no upload/playback UI, no
-- Storage bucket or path change, no change to the legacy `thumbnail` /
-- `main` / `guide` / `demo` roles, and no change to the Exercise Registry
-- completion calculation. Legacy media stays resolved exactly as it is
-- today (see src/lib/exercise-media.ts); these tables govern only the new
-- V2 pipeline.
--
-- Why not runtime-computed status or a Storage marker file (qa.json)?
-- Neither can represent a QA-gated state machine safely: file *presence*
-- only proves an asset was uploaded, not that a human approved it, and
-- neither option gives RLS-scoped privacy, transactional consistency with
-- the actual asset write, or a queryable/auditable history — all of which
-- this table set provides directly.
--
-- What this migration deliberately does NOT enforce: that a version's
-- required assets (hero_cover + motion_video) actually exist as rows in
-- exercise_media_assets before it can reach qa_passed/published. Checking
-- sibling/child-row presence from a CHECK constraint on the parent row is
-- unsafe in Postgres (CHECK constraints cannot see other rows consistently
-- under concurrent writes) and would race with the asset upload itself.
-- That guarantee belongs to the future privileged publish service, which
-- can perform the "assets present and QA-approved" verification and the
-- status transition inside one transaction, with the service-role
-- privileges this migration already reserves for all such mutations.

-- ============================================================================
-- 1. exercise_media_versions
-- ============================================================================

create table public.exercise_media_versions (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  demonstrator_key text not null check (demonstrator_key in ('daniel', 'maya')),
  status text not null default 'draft' check (
    status in (
      'draft',
      'media_ready',
      'qa_passed',
      'published',
      'rejected',
      'replacement_required',
      'trash',
      'archived'
    )
  ),
  created_by uuid not null references auth.users(id) on delete restrict,
  qa_reviewed_by uuid references auth.users(id) on delete set null,
  qa_reviewed_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 2000),
  trashed_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint exercise_media_versions_exercise_version_unique
    unique (exercise_id, version_number),

  -- QA fields are set together or not at all, on every status (Draft and
  -- Media Ready included - they simply won't have them yet).
  constraint exercise_media_versions_qa_state_check check (
    (qa_reviewed_by is null and qa_reviewed_at is null)
    or (qa_reviewed_by is not null and qa_reviewed_at is not null)
  ),

  -- Publication requires QA approval: reaching qa_passed or published
  -- requires qa_reviewed_by/qa_reviewed_at to already be set (combined with
  -- the pair-consistency check above, both must be non-null together).
  -- Draft/Media Ready are not required to have QA fields either way. Later
  -- states (rejected, replacement_required, trash, archived) may retain
  -- whatever QA fields a prior qa_passed/published transition left behind -
  -- this check only ever requires them, never forbids them, so that
  -- history is preserved rather than wiped on a later transition.
  constraint exercise_media_versions_qa_required_before_publish_check check (
    status not in ('qa_passed', 'published')
    or (qa_reviewed_by is not null and qa_reviewed_at is not null)
  ),

  -- Published fields exist if and only if status = 'published'. Combined
  -- with the QA-required check above, a row cannot be published without
  -- also carrying a completed QA review.
  constraint exercise_media_versions_published_state_check check (
    (status = 'published' and published_by is not null and published_at is not null)
    or (status <> 'published' and published_by is null and published_at is null)
  ),

  -- Rejection actor/timestamp exist if and only if status = 'rejected'.
  -- rejection_reason stays independently nullable (per spec) even when rejected.
  constraint exercise_media_versions_rejected_state_check check (
    (status = 'rejected' and rejected_by is not null and rejected_at is not null)
    or (
      status <> 'rejected'
      and rejected_by is null
      and rejected_at is null
      and rejection_reason is null
    )
  ),

  -- A Trash row must carry both trashed_at and purge_after; a non-Trash row
  -- must carry neither. The default-purge-after trigger below guarantees
  -- this pair is always populated together, so this CHECK cannot be
  -- satisfied accidentally by a half-populated transition.
  constraint exercise_media_versions_trash_state_check check (
    (status = 'trash' and trashed_at is not null and purge_after is not null)
    or (status <> 'trash' and trashed_at is null and purge_after is null)
  ),

  -- purge_after can never be scheduled earlier than trashed_at itself.
  constraint exercise_media_versions_trash_order_check check (
    trashed_at is null or purge_after is null or purge_after >= trashed_at
  )
);

comment on table public.exercise_media_versions is
  'One curated Hero Cover + Motion Video package for one exercise. Lifecycle '
  'is enforced by CHECK constraints and the two partial unique indexes below; '
  'no row is ever deleted by client code (see grants).';

comment on column public.exercise_media_versions.purge_after is
  'Trash retention target, defaulted to trashed_at + 30 days by the trigger '
  'below when a future application flow moves a row to trash. No job in '
  'this migration reads or acts on this column — automatic destructive '
  'purge is explicitly out of scope for this sprint.';

-- At most one Published version per exercise.
create unique index exercise_media_versions_one_published
  on public.exercise_media_versions (exercise_id)
  where status = 'published';

-- At most one active *working* version per exercise. Trash and Archived are
-- terminal/historical and excluded, so version history can accumulate there
-- freely while only one row is ever "in flight" at a time. This is what
-- guarantees a new Draft can never be created alongside (and therefore can
-- never silently replace) the currently Published row, which lives outside
-- this state set entirely.
create unique index exercise_media_versions_one_active_working
  on public.exercise_media_versions (exercise_id)
  where status in ('draft', 'media_ready', 'qa_passed', 'rejected', 'replacement_required');

create index exercise_media_versions_exercise_id_idx
  on public.exercise_media_versions (exercise_id);

create index exercise_media_versions_status_idx
  on public.exercise_media_versions (status);

-- Default the Trash retention pair (30 days) whenever a row enters `trash`
-- without the application having set trashed_at/purge_after itself. This is
-- a value default, not a deletion job: nothing in this trigger removes rows.
create or replace function public.exercise_media_versions_default_trash_retention()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'trash' then
    if new.trashed_at is null then
      new.trashed_at := now();
    end if;
    if new.purge_after is null then
      new.purge_after := new.trashed_at + interval '30 days';
    end if;
  end if;
  return new;
end;
$$;

-- Not SECURITY DEFINER (runs with the invoking/trigger session's rights,
-- same as touch_updated_at()), and not directly callable by client roles:
-- revoking EXECUTE from PUBLIC does not affect trigger firing, since the
-- trigger manager invokes a trigger function internally rather than through
-- a role's EXECUTE privilege check.
revoke execute on function public.exercise_media_versions_default_trash_retention() from public;

create trigger exercise_media_versions_trash_retention
  before insert or update on public.exercise_media_versions
  for each row execute function public.exercise_media_versions_default_trash_retention();

create trigger exercise_media_versions_updated_at
  before update on public.exercise_media_versions
  for each row execute function public.touch_updated_at();

alter table public.exercise_media_versions enable row level security;

-- Explicit and unconditional: strip whatever a Supabase project's default
-- privileges (ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon,
-- authenticated, service_role, applied automatically to every new table in
-- the public schema) would otherwise hand out, rather than relying on them
-- never having been granted in the first place.
revoke all on public.exercise_media_versions from public, anon, authenticated;

-- Normal authenticated users may only ever see Published metadata. No
-- INSERT/UPDATE/DELETE grant exists for `authenticated` at all, so no
-- corresponding RLS policy is needed or created for those operations —
-- the lifecycle mutations described in the sprint (publish/reject/trash/
-- restore/archive) are reserved for the existing server-side Admin
-- pattern (src/integrations/supabase/admin-middleware.ts +
-- src/integrations/supabase/client.server.ts's service-role client),
-- which bypasses RLS entirely rather than needing a client-facing policy.
grant select on public.exercise_media_versions to authenticated;
grant all on public.exercise_media_versions to service_role;

create policy "published media versions are readable"
  on public.exercise_media_versions
  for select
  to authenticated
  using (status = 'published');

-- ============================================================================
-- 2. exercise_media_assets
-- ============================================================================

create table public.exercise_media_assets (
  id uuid primary key default gen_random_uuid(),
  media_version_id uuid not null references public.exercise_media_versions(id) on delete cascade,
  role text not null check (role in ('hero_cover', 'motion_video')),
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_ms integer check (duration_ms is null or duration_ms > 0),
  frame_rate numeric check (frame_rate is null or frame_rate > 0),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint exercise_media_assets_version_role_unique unique (media_version_id, role),

  -- Hero Cover: approved still-image formats. Exact dimensions/size ceiling
  -- remain an explicit Open Decision (docs/veis-hero-and-motion-standard.md)
  -- and are intentionally NOT invented here.
  constraint exercise_media_assets_hero_mime_check check (
    role <> 'hero_cover' or mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),

  -- Motion Video: container/codec claim, 3MB ceiling, 6-10s duration,
  -- 1280x720, 30fps — the approved V1 technical standard. Every clause is
  -- written as `role <> 'motion_video' or (col is not null and ...)`:
  -- Postgres treats a CHECK that evaluates to NULL as satisfied, so without
  -- the explicit `is not null` a motion_video row with a missing width/
  -- height/frame_rate/duration would silently pass.
  constraint exercise_media_assets_motion_mime_check check (
    role <> 'motion_video' or mime_type = 'video/mp4'
  ),
  constraint exercise_media_assets_motion_size_check check (
    role <> 'motion_video' or file_size_bytes <= 3145728 -- 3 MiB (3 * 1024 * 1024)
  ),
  constraint exercise_media_assets_motion_duration_check check (
    role <> 'motion_video' or (duration_ms is not null and duration_ms between 6000 and 10000)
  ),
  constraint exercise_media_assets_motion_dimensions_check check (
    role <> 'motion_video'
    or (width is not null and height is not null and width = 1280 and height = 720)
  ),
  constraint exercise_media_assets_motion_frame_rate_check check (
    role <> 'motion_video' or (frame_rate is not null and frame_rate = 30)
  )
);

comment on table public.exercise_media_assets is
  'Individual Hero Cover / Motion Video files belonging to one media version. '
  'One row per role per version (unique (media_version_id, role)).';

comment on column public.exercise_media_assets.mime_type is
  'Client/uploader-reported MIME type only. The actual codec profile and the '
  'absence of an audio track cannot be trusted from client-supplied metadata '
  '- a privileged upload/QA service must independently probe the file (e.g. '
  'ffprobe) before a version is allowed to reach qa_passed/published. This '
  'table records the *claimed* format; it is not itself the verification.';

create index exercise_media_assets_media_version_id_idx
  on public.exercise_media_assets (media_version_id);

create trigger exercise_media_assets_updated_at
  before update on public.exercise_media_assets
  for each row execute function public.touch_updated_at();

alter table public.exercise_media_assets enable row level security;

-- See the identical note on exercise_media_versions above: explicit,
-- unconditional revoke before the explicit re-grant.
revoke all on public.exercise_media_assets from public, anon, authenticated;

grant select on public.exercise_media_assets to authenticated;
grant all on public.exercise_media_assets to service_role;

create policy "assets of published media versions are readable"
  on public.exercise_media_assets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.exercise_media_versions v
      where v.id = exercise_media_assets.media_version_id
        and v.status = 'published'
    )
  );

-- ============================================================================
-- 3. exercise_media_asset_events
-- ============================================================================

create table public.exercise_media_asset_events (
  id uuid primary key default gen_random_uuid(),
  media_version_id uuid not null references public.exercise_media_versions(id) on delete restrict,
  event_type text not null check (
    event_type in (
      'created',
      'asset_uploaded',
      'media_ready',
      'qa_passed',
      'rejected',
      'replacement_required',
      'published',
      'moved_to_trash',
      'restored',
      'archived'
    )
  ),
  from_status text check (
    from_status is null or from_status in (
      'draft', 'media_ready', 'qa_passed', 'published',
      'rejected', 'replacement_required', 'trash', 'archived'
    )
  ),
  to_status text check (
    to_status is null or to_status in (
      'draft', 'media_ready', 'qa_passed', 'published',
      'rejected', 'replacement_required', 'trash', 'archived'
    )
  ),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 2000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.exercise_media_asset_events is
  'Append-only lifecycle/QA audit trail for exercise_media_versions. No '
  'updated_at column by design - there is nothing to touch on an immutable '
  'row. The version FK uses ON DELETE RESTRICT (not CASCADE) specifically '
  'so audit history cannot disappear as a side effect of a version being '
  'removed; deleting a version is not exposed as a normal operation to '
  'begin with (see exercise_media_versions grants).';

create index exercise_media_asset_events_media_version_id_idx
  on public.exercise_media_asset_events (media_version_id, created_at);

-- Hard immutability: block UPDATE/DELETE unconditionally, independent of
-- role or RLS. Even the service-role backend that inserts these rows must
-- never edit or remove one after the fact.
create or replace function public.exercise_media_asset_events_block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'exercise_media_asset_events is append-only; % is not permitted', tg_op;
end;
$$;

-- Not SECURITY DEFINER; not directly callable by client roles (revoking
-- EXECUTE from PUBLIC does not affect trigger firing - see the identical
-- note on exercise_media_versions_default_trash_retention() above).
revoke execute on function public.exercise_media_asset_events_block_mutation() from public;

create trigger exercise_media_asset_events_no_update
  before update on public.exercise_media_asset_events
  for each row execute function public.exercise_media_asset_events_block_mutation();

create trigger exercise_media_asset_events_no_delete
  before delete on public.exercise_media_asset_events
  for each row execute function public.exercise_media_asset_events_block_mutation();

alter table public.exercise_media_asset_events enable row level security;

-- Fully private: no grant at all for anon/authenticated, so no client role
-- can ever read, insert, update, or delete a row, regardless of policy. RLS
-- is still enabled (repository convention / defense in depth) even though,
-- with zero grants, no policy is reachable by a client role. Only
-- service_role (used exclusively from the trusted server boundary) can
-- write these rows; there is no client-facing "safe Admin" policy for this
-- table because none of it is meant to be client-readable in V1.
revoke all on public.exercise_media_asset_events from public, anon, authenticated;
grant all on public.exercise_media_asset_events to service_role;
