-- Exercise Media V2 follow-up migration.
--
-- Does NOT edit supabase/migrations/20260902065412_exercise_media_lifecycle_data.sql
-- (already merged via PR #3) - every change here is additive/corrective on
-- top of it, per this repository's append-only migration convention.
--
-- Three changes:
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
--   3. A single atomic finalize function so a Motion Video's asset row and
--      its audit event(s) are written in one transaction instead of
--      separate client-driven calls, closing the partial-write window
--      between them.

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
-- 3. Atomic asset + audit-event finalization
-- ============================================================================

-- Upserts the motion_video asset row for one media version and appends the
-- matching audit event(s) in a single transaction, closing the gap between
-- "asset row written" and "audit event written" that two separate
-- service-role calls would otherwise leave open. SECURITY INVOKER (not
-- DEFINER, matching this repository's convention) - it is reachable only
-- via the service-role client, which already bypasses RLS on both target
-- tables, so no privilege escalation is introduced.
create or replace function public.finalize_exercise_motion_video_asset(
  p_media_version_id uuid,
  p_is_new_draft boolean,
  p_storage_path text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_width integer,
  p_height integer,
  p_duration_ms integer,
  p_frame_rate numeric,
  p_checksum_sha256 text,
  p_actor_user_id uuid,
  p_replaced_previous boolean
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_asset_id uuid;
begin
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

  if p_is_new_draft then
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
      'replacedPreviousAsset', p_replaced_previous
    )
  );

  return v_asset_id;
end;
$$;

comment on function public.finalize_exercise_motion_video_asset is
  'Service-role-only. Atomically upserts one motion_video asset row and '
  'appends its audit event(s) in a single transaction. Not SECURITY '
  'DEFINER - relies entirely on the calling service-role connection, '
  'exactly like every other privileged write in this schema.';

revoke execute on function public.finalize_exercise_motion_video_asset from public, anon, authenticated;
grant execute on function public.finalize_exercise_motion_video_asset to service_role;
