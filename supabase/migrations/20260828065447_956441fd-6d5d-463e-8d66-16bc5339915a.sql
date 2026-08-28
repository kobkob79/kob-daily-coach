-- Forward-only limit expansion: every About subject, including `team`, may
-- have at most five active images. Existing rows, ordering, RLS and Storage
-- objects are unchanged.
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

    if active_count >= 5 then
      raise exception 'ABOUT_MEDIA_LIMIT_EXCEEDED';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_about_media_limits() from public, anon, authenticated;
grant execute on function public.validate_about_media_limits() to service_role;