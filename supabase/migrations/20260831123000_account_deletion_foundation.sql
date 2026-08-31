-- Account deletion lifecycle foundation. This migration is intentionally not applied by this sprint.

create table public.account_deletion_requests (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'storage_failed', 'auth_failed')),
  safe_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.account_deletion_requests enable row level security;
revoke all on table public.account_deletion_requests from public, anon, authenticated;
grant all on table public.account_deletion_requests to service_role;

-- Shared About media must survive deletion of the admin who originally created it.
alter table public.about_media alter column created_by drop not null;
alter table public.about_media drop constraint if exists about_media_created_by_fkey;
alter table public.about_media
  add constraint about_media_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

-- Some environments may contain the audited exercise_assets table even though it is not
-- represented by the committed repository schema. Harden it only when its exact shape exists.
do $$
declare
  existing_fk text;
begin
  if to_regclass('public.exercise_assets') is not null then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'exercise_assets'
        and column_name = 'created_by'
        and udt_name = 'uuid'
    ) then
      raise exception 'ACCOUNT_DELETION_EXERCISE_ASSETS_SCHEMA_DRIFT';
    end if;

    select constraint_row.conname into existing_fk
    from pg_constraint constraint_row
    join pg_class source_table on source_table.oid = constraint_row.conrelid
    join pg_namespace source_schema on source_schema.oid = source_table.relnamespace
    join pg_attribute source_column
      on source_column.attrelid = source_table.oid
      and source_column.attnum = any (constraint_row.conkey)
    where constraint_row.contype = 'f'
      and source_schema.nspname = 'public'
      and source_table.relname = 'exercise_assets'
      and source_column.attname = 'created_by'
      and constraint_row.confrelid = 'auth.users'::regclass
    order by constraint_row.conname
    limit 1;

    if existing_fk is null then
      raise exception 'ACCOUNT_DELETION_EXERCISE_ASSETS_FK_MISSING';
    end if;

    execute 'alter table public.exercise_assets alter column created_by drop not null';
    execute format('alter table public.exercise_assets drop constraint %I', existing_fk);
    alter table public.exercise_assets
      add constraint exercise_assets_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null;
  end if;
end;
$$;
