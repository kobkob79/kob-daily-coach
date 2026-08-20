-- Viora Advisor Free V1: one successful AI response per user per UTC day.
-- Reservations serialize concurrent requests before the external provider call.

create table public.advisor_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  successful_questions integer not null default 0,
  reservation_token uuid,
  reservation_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advisor_daily_usage_pkey primary key (user_id, usage_date),
  constraint advisor_daily_usage_successful_questions_check
    check (successful_questions between 0 and 1),
  constraint advisor_daily_usage_reservation_pair_check
    check (
      (reservation_token is null and reservation_expires_at is null)
      or
      (reservation_token is not null and reservation_expires_at is not null)
    )
);

alter table public.advisor_daily_usage enable row level security;

revoke all on table public.advisor_daily_usage from public, anon, authenticated;
grant select, insert, update on table public.advisor_daily_usage to service_role;

create trigger advisor_daily_usage_updated_at
before update on public.advisor_daily_usage
for each row execute function public.touch_updated_at();

create or replace function public.get_advisor_daily_quota(
  p_user_id uuid
)
returns table (
  allowed boolean,
  used integer,
  "limit" integer,
  remaining integer,
  resets_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_usage_date date := (timezone('utc', v_now))::date;
  v_used integer := 0;
  v_reserved boolean := false;
begin
  if p_user_id is null then
    raise exception 'Authenticated user is required';
  end if;

  select
    usage.successful_questions,
    usage.reservation_token is not null
      and usage.reservation_expires_at > v_now
  into v_used, v_reserved
  from public.advisor_daily_usage as usage
  where usage.user_id = p_user_id
    and usage.usage_date = v_usage_date;

  if not found then
    v_used := 0;
    v_reserved := false;
  end if;

  return query select
    v_used < 1 and not v_reserved,
    v_used,
    1,
    case when v_used < 1 and not v_reserved then 1 else 0 end,
    ((v_usage_date + 1)::timestamp at time zone 'utc');
end;
$$;

create or replace function public.claim_advisor_daily_quota(
  p_user_id uuid,
  p_claim_token uuid
)
returns table (
  allowed boolean,
  used integer,
  "limit" integer,
  remaining integer,
  resets_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_usage_date date := (timezone('utc', v_now))::date;
  v_used integer := 0;
  v_claimed boolean := false;
begin
  if p_user_id is null or p_claim_token is null then
    raise exception 'Authenticated user and claim token are required';
  end if;

  insert into public.advisor_daily_usage as usage (
    user_id,
    usage_date,
    successful_questions,
    reservation_token,
    reservation_expires_at
  ) values (
    p_user_id,
    v_usage_date,
    0,
    p_claim_token,
    v_now + interval '15 minutes'
  )
  on conflict on constraint advisor_daily_usage_pkey do update
  set
    reservation_token = excluded.reservation_token,
    reservation_expires_at = excluded.reservation_expires_at
  where usage.successful_questions < 1
    and (
      usage.reservation_token is null
      or usage.reservation_expires_at <= v_now
    )
  returning usage.successful_questions into v_used;

  v_claimed := found;

  if not v_claimed then
    select usage.successful_questions
    into v_used
    from public.advisor_daily_usage as usage
    where usage.user_id = p_user_id
      and usage.usage_date = v_usage_date;

    v_used := coalesce(v_used, 0);
  end if;

  return query select
    v_claimed,
    v_used,
    1,
    0,
    ((v_usage_date + 1)::timestamp at time zone 'utc');
end;
$$;

create or replace function public.finalize_advisor_daily_quota(
  p_user_id uuid,
  p_claim_token uuid
)
returns table (
  allowed boolean,
  used integer,
  "limit" integer,
  remaining integer,
  resets_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_usage_date date := (timezone('utc', v_now))::date;
  v_updated integer;
begin
  update public.advisor_daily_usage as usage
  set
    successful_questions = 1,
    reservation_token = null,
    reservation_expires_at = null
  where usage.user_id = p_user_id
    and usage.usage_date = v_usage_date
    and usage.successful_questions = 0
    and usage.reservation_token = p_claim_token;

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Advisor quota claim could not be finalized';
  end if;

  return query select
    false,
    1,
    1,
    0,
    ((v_usage_date + 1)::timestamp at time zone 'utc');
end;
$$;

create or replace function public.release_advisor_daily_quota(
  p_user_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usage_date date := (timezone('utc', statement_timestamp()))::date;
  v_updated integer;
begin
  update public.advisor_daily_usage as usage
  set
    reservation_token = null,
    reservation_expires_at = null
  where usage.user_id = p_user_id
    and usage.usage_date = v_usage_date
    and usage.successful_questions = 0
    and usage.reservation_token = p_claim_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke execute on function public.get_advisor_daily_quota(uuid)
  from public, anon, authenticated;
revoke execute on function public.claim_advisor_daily_quota(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.finalize_advisor_daily_quota(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.release_advisor_daily_quota(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.get_advisor_daily_quota(uuid) to service_role;
grant execute on function public.claim_advisor_daily_quota(uuid, uuid) to service_role;
grant execute on function public.finalize_advisor_daily_quota(uuid, uuid) to service_role;
grant execute on function public.release_advisor_daily_quota(uuid, uuid) to service_role;
