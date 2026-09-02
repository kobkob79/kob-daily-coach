-- Exercise Media V2 follow-up migration.
--
-- Does NOT edit supabase/migrations/20260902065412_exercise_media_lifecycle_data.sql
-- (already merged via PR #3) - every change here is additive/corrective on
-- top of it, per this repository's append-only migration convention.
--
-- Four changes:
--   1. Official demonstrator policy simplified to one generic demonstrator
--      (VIORA-EXERCISE-GENERIC-DEMONSTRATOR-DECISION-001 supersedes the
--      prior daniel/maya decision). demonstrator_key now accepts only
--      'generic'.
--   2. exercise_media_assets.frame_rate becomes nullable for an honestly
--      *unverified* Motion Video: neither the browser nor the trusted
--      server can measure encoded frame rate in this environment (no
--      video-decoding capability exists here), and fabricating `30` to
--      satisfy a NOT NULL constraint would be worse than recording that
--      the fact is not yet known. The constraint still rejects any value
--      other than NULL or exactly 30 - it only ever admits "unverified" or
--      "verified and correct", never "verified and wrong".
--   3. reserve_exercise_media_draft(): a service-role-only RPC that
--      serializes Draft creation/reuse per exercise behind an
--      xact-scoped advisory lock, so two concurrent requests for the same
--      exercise can never create two Draft rows or collide unpredictably.
--   4. finalize_exercise_motion_video_asset(): locks and re-checks the
--      parent version's status (must be exactly 'draft') and the existing
--      motion_video asset row (replacement requires explicit
--      confirmation) *inside* the same transaction that writes the asset
--      and its audit event(s) - closing the race where a pre-RPC read
--      could go stale before the write actually happens. Returns an
--      outcome the caller switches on (never raises for expected control
--      flow), including the actual previous storage path captured at
--      transaction time, so the server removes exactly the object the
--      transaction says was superseded - never a path from a stale read.

-- ============================================================================
-- 1. demonstrator_key: daniel/maya -> generic only
-- ============================================================================

-- Drop the old daniel/maya-only constraint FIRST: the normalization UPDATE
-- below writes 'generic', a value the old constraint does not admit, so
-- doing this in the other order would make the UPDATE itself fail.
alter table public.exercise_media_versions
  drop constraint if exists exercise_media_versions_demonstrator_key_check;

-- Normalize any pre-existing daniel/maya rows before installing the new,
-- stricter constraint - required so the ALTER below can succeed at all,
-- and so no existing row silently becomes invalid.
update public.exercise_media_versions
set demonstrator_key = 'generic'
where demonstrator_key in ('daniel', 'maya');

alter table public.exercise_media_versions
  add constraint exercise_media_versions_demonstrator_key_check
  check (demonstrator_key in ('generic'));

alter table public.exercise_media_versions
  alter column demonstrator_key set default 'generic';

-- NOT NULL is unchanged from the original migration (the column was
-- already `not null`); re-asserted here only as documentation of intent.
alter table public.exercise_media_versions
  alter column demonstrator_key set not null;

comment on column public.exercise_media_versions.demonstrator_key is
  'V1 uses exactly one official generic demonstrator; multiple official '
  'demonstrators and any user-selectable variant are postponed (see '
  'docs/veis-hero-and-motion-standard.md). The single(-value) CHECK below '
  'keeps the column future-extensible - widening it later is one '
  'migration, not a data model change - without exposing an unused choice '
  'today.';

-- ============================================================================
-- 2. frame_rate: NOT NULL + = 30  ->  NULL (unverified) or exactly 30
-- ============================================================================

alter table public.exercise_media_assets
  drop constraint if exists exercise_media_assets_motion_frame_rate_check;

alter table public.exercise_media_assets
  add constraint exercise_media_assets_motion_frame_rate_check
  check (role <> 'motion_video' or frame_rate is null or frame_rate = 30);

comment on column public.exercise_media_assets.frame_rate is
  'NULL means "not yet verified" - the honest state for a Draft uploaded '
  'through the current Admin flow, since neither the browser nor the '
  'trusted server can decode video to measure this in this environment. '
  'A non-null value must be exactly 30 (the approved V1 standard) - this '
  'column can hold "unverified" or "verified and correct", never '
  '"verified and wrong". Setting a genuine, verified value is the '
  'responsibility of a future privileged probing service; nothing in this '
  'migration weakens that requirement for values that ARE supplied.';

-- ============================================================================
-- 3. Draft creation/reuse, serialized per exercise
-- ============================================================================

-- Reserves the exercise's active Draft: reuses it if one already exists in
-- status 'draft', reports a conflict for any other working status, or
-- creates a brand-new one. `pg_advisory_xact_lock` is scoped to the
-- current transaction (this RPC call, since it is invoked as a single
-- top-level statement with no surrounding client transaction) and is
-- released automatically at commit/rollback - no manual unlock needed,
-- safe under connection pooling. It serializes concurrent callers for the
-- SAME exercise_id (a second call blocks until the first commits, then
-- correctly observes the just-inserted row), which a row-level lock alone
-- cannot do for the "no row exists yet" case. SECURITY INVOKER, reachable
-- only via the service-role client.
create or replace function public.reserve_exercise_media_draft(
  p_exercise_id uuid,
  p_actor_user_id uuid
)
returns table (
  outcome text, -- 'reserved' | 'conflict'
  media_version_id uuid,
  version_number integer,
  demonstrator_key text,
  is_new_draft boolean,
  blocked_status text -- set only when outcome = 'conflict'
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing record;
  v_next_version integer;
  v_new_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_exercise_id::text)::bigint);

  select emv.id, emv.version_number, emv.demonstrator_key, emv.status
    into v_existing
    from public.exercise_media_versions emv
    where emv.exercise_id = p_exercise_id
      and emv.status in ('draft', 'media_ready', 'qa_passed', 'rejected', 'replacement_required')
    for update;

  if found then
    if v_existing.status <> 'draft' then
      return query select 'conflict'::text, null::uuid, null::integer, null::text, null::boolean, v_existing.status;
      return;
    end if;
    return query
      select 'reserved'::text, v_existing.id, v_existing.version_number, v_existing.demonstrator_key,
             false, null::text;
    return;
  end if;

  select coalesce(max(emv.version_number), 0) + 1
    into v_next_version
    from public.exercise_media_versions emv
    where emv.exercise_id = p_exercise_id;

  insert into public.exercise_media_versions (exercise_id, version_number, demonstrator_key, status, created_by)
  values (p_exercise_id, v_next_version, 'generic', 'draft', p_actor_user_id)
  returning id into v_new_id;

  return query select 'reserved'::text, v_new_id, v_next_version, 'generic'::text, true, null::text;
end;
$$;

comment on function public.reserve_exercise_media_draft is
  'Service-role-only. Serializes Draft creation/reuse per exercise behind '
  'an xact-scoped advisory lock so concurrent requests for the same '
  'exercise cannot create two Draft rows or collide unpredictably. Not '
  'SECURITY DEFINER - service_role already has the privileges it needs.';

revoke execute on function public.reserve_exercise_media_draft from public, anon, authenticated;
grant execute on function public.reserve_exercise_media_draft to service_role;

-- ============================================================================
-- 4. Atomic, re-checked asset + audit-event finalization
-- ============================================================================

-- Upserts the motion_video asset row for one media version and appends the
-- matching audit event(s) in a single transaction, closing the gap between
-- "asset row written" and "audit event written" that two separate
-- service-role calls would otherwise leave open. Also closes a second,
-- more important gap: it locks and re-verifies the parent version's
-- status and the existing asset row *inside this same transaction*,
-- rather than trusting a pre-RPC read that could go stale before the
-- write happens. Returns an `outcome` the caller switches on - it never
-- raises for expected control flow (version_not_found /
-- version_not_draft / needs_confirmation / finalized), so the client
-- never has to parse exception text to distinguish them.
--
-- SECURITY INVOKER (not DEFINER, matching this repository's convention) -
-- reachable only via the service-role client, which already bypasses RLS
-- on every target table, so no privilege escalation is introduced.
create or replace function public.finalize_exercise_motion_video_asset(
  p_media_version_id uuid,
  p_confirm_replace boolean,
  p_storage_path text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_width integer,
  p_height integer,
  p_duration_ms integer,
  p_frame_rate numeric,
  p_checksum_sha256 text,
  p_actor_user_id uuid
)
returns table (
  outcome text, -- 'finalized' | 'needs_confirmation' | 'version_not_found' | 'version_not_draft'
  asset_id uuid, -- set only when outcome = 'finalized'
  previous_storage_path text, -- set when outcome in ('finalized' [replacement], 'needs_confirmation')
  was_replacement boolean, -- set only when outcome = 'finalized'
  blocked_status text -- set only when outcome = 'version_not_draft'
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_version_status text;
  v_existing_id uuid;
  v_existing_path text;
  v_asset_id uuid;
  v_is_new_draft boolean;
begin
  -- Lock the parent version FIRST: no concurrent finalize/reject/publish
  -- transition on this same version can proceed until this one commits.
  select ev.status
    into v_version_status
    from public.exercise_media_versions ev
    where ev.id = p_media_version_id
    for update;

  if not found then
    return query select 'version_not_found'::text, null::uuid, null::text, null::boolean, null::text;
    return;
  end if;

  if v_version_status <> 'draft' then
    -- Never modify an asset belonging to a version that has moved on to
    -- media_ready / qa_passed / published / rejected / replacement_required
    -- / trash / archived - the CHECK above already excludes 'draft' being
    -- true here, so every other status is covered.
    return query select 'version_not_draft'::text, null::uuid, null::text, null::boolean, v_version_status;
    return;
  end if;

  -- Lock the existing motion_video asset row (if any) before deciding
  -- whether this is a first-time write or a replacement - this is the
  -- authoritative, race-free version of the confirmation check.
  select ema.id, ema.storage_path
    into v_existing_id, v_existing_path
    from public.exercise_media_assets ema
    where ema.media_version_id = p_media_version_id
      and ema.role = 'motion_video'
    for update;

  if found and not p_confirm_replace then
    return query select 'needs_confirmation'::text, v_existing_id, v_existing_path, null::boolean, null::text;
    return;
  end if;

  -- "New Draft" for audit purposes means "no event has ever been recorded
  -- for this version yet" - self-determined here rather than trusted from
  -- the caller, so it can never be wrong regardless of how this RPC is
  -- invoked.
  select not exists (
    select 1 from public.exercise_media_asset_events e where e.media_version_id = p_media_version_id
  ) into v_is_new_draft;

  insert into public.exercise_media_assets (
    media_version_id, role, storage_path, mime_type, file_size_bytes,
    width, height, duration_ms, frame_rate, checksum_sha256
  ) values (
    p_media_version_id, 'motion_video', p_storage_path, p_mime_type, p_file_size_bytes,
    p_width, p_height, p_duration_ms, p_frame_rate, p_checksum_sha256
  )
  on conflict (media_version_id, role) do update set
    storage_path = excluded.storage_path,
    mime_type = excluded.mime_type,
    file_size_bytes = excluded.file_size_bytes,
    width = excluded.width,
    height = excluded.height,
    duration_ms = excluded.duration_ms,
    frame_rate = excluded.frame_rate,
    checksum_sha256 = excluded.checksum_sha256,
    updated_at = now()
  returning id into v_asset_id;

  if v_is_new_draft then
    insert into public.exercise_media_asset_events (
      media_version_id, event_type, to_status, actor_user_id, metadata
    ) values (
      p_media_version_id, 'created', 'draft', p_actor_user_id,
      jsonb_build_object('role', 'motion_video')
    );
  end if;

  insert into public.exercise_media_asset_events (
    media_version_id, event_type, to_status, actor_user_id, metadata
  ) values (
    p_media_version_id, 'asset_uploaded', null, p_actor_user_id,
    jsonb_build_object(
      'role', 'motion_video',
      'fileSizeBytes', p_file_size_bytes,
      'width', p_width,
      'height', p_height,
      'durationMs', p_duration_ms,
      'frameRateVerified', p_frame_rate is not null,
      'replacedPreviousAsset', v_existing_id is not null
    )
  );

  return query select 'finalized'::text, v_asset_id, v_existing_path, (v_existing_id is not null), null::text;
end;
$$;

comment on function public.finalize_exercise_motion_video_asset is
  'Service-role-only. Locks and re-checks the parent version status and '
  'any existing motion_video asset row inside the same transaction that '
  'writes the asset and its audit event(s), then returns an outcome the '
  'caller switches on. Not SECURITY DEFINER - relies entirely on the '
  'calling service-role connection, exactly like every other privileged '
  'write in this schema.';

revoke execute on function public.finalize_exercise_motion_video_asset from public, anon, authenticated;
grant execute on function public.finalize_exercise_motion_video_asset to service_role;
