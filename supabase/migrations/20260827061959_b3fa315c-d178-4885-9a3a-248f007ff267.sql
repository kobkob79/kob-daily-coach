create table public.about_media (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (subject in ('team', 'kobi', 'adam', 'daniel', 'maya', 'shiran')),
  storage_bucket text not null default 'viora-team-media'
    check (storage_bucket = 'viora-team-media'),
  storage_path text not null unique,
  caption text check (caption is null or char_length(caption) <= 180),
  alt_text text check (alt_text is null or char_length(alt_text) <= 180),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path ~ ('^' || subject || '/[0-9a-f-]+\.(jpg|jpeg|png|webp)$'))
);

create unique index about_media_one_primary_per_subject
  on public.about_media (subject)
  where is_primary and is_active;

create index about_media_public_order
  on public.about_media (subject, sort_order, created_at)
  where is_active;

create or replace function public.validate_about_media_limits()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  active_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('about_media:' || new.subject));

  if new.is_active then
    select count(*) into active_count
    from public.about_media
    where subject = new.subject
      and is_active
      and id <> new.id;

    if (new.subject = 'team' and active_count >= 1)
       or (new.subject <> 'team' and active_count >= 5) then
      raise exception 'ABOUT_MEDIA_LIMIT_EXCEEDED';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger validate_about_media_limits_before_write
before insert or update on public.about_media
for each row execute function public.validate_about_media_limits();

create or replace function public.set_about_media_primary(p_media_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_subject text;
begin
  select subject into target_subject
  from public.about_media
  where id = p_media_id and is_active
  for update;

  if target_subject is null then
    raise exception 'ABOUT_MEDIA_NOT_FOUND';
  end if;

  update public.about_media
  set is_primary = false
  where subject = target_subject and is_primary and id <> p_media_id;

  update public.about_media
  set is_primary = true
  where id = p_media_id;
end;
$$;

create or replace function public.reorder_about_media(p_subject text, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  expected_count integer;
  supplied_count integer;
begin
  if p_subject not in ('team', 'kobi', 'adam', 'daniel', 'maya', 'shiran') then
    raise exception 'INVALID_SUBJECT';
  end if;

  perform pg_advisory_xact_lock(hashtext('about_media:' || p_subject));
  select count(*) into expected_count from public.about_media where subject = p_subject;
  select count(distinct id) into supplied_count from unnest(p_ids) as supplied(id);

  if cardinality(p_ids) <> expected_count or supplied_count <> expected_count
     or exists (
       select 1 from unnest(p_ids) as supplied(id)
       where not exists (
         select 1 from public.about_media media
         where media.id = supplied.id and media.subject = p_subject
       )
     ) then
    raise exception 'INVALID_MEDIA_ORDER';
  end if;

  update public.about_media media
  set sort_order = ordered.ordinality - 1
  from unnest(p_ids) with ordinality as ordered(id, ordinality)
  where media.id = ordered.id and media.subject = p_subject;
end;
$$;

alter table public.about_media enable row level security;

revoke all on table public.about_media from public, anon, authenticated;
grant select on table public.about_media to anon, authenticated;
grant all on table public.about_media to service_role;

create policy "Active About media is publicly readable"
on public.about_media for select
to anon, authenticated
using (is_active);

revoke all on function public.set_about_media_primary(uuid) from public, anon, authenticated;
grant execute on function public.set_about_media_primary(uuid) to service_role;
revoke all on function public.reorder_about_media(text, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_about_media(text, uuid[]) to service_role;
revoke all on function public.validate_about_media_limits() from public, anon, authenticated;
grant execute on function public.validate_about_media_limits() to service_role;