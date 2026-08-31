create table public.advisor_context_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  context_sharing_enabled boolean not null default false,
  consented_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advisor_context_preferences_consent_state_check check (
    (context_sharing_enabled and consented_at is not null and revoked_at is null)
    or
    (not context_sharing_enabled)
  )
);

alter table public.advisor_context_preferences enable row level security;

create policy "Users read own advisor context preference"
  on public.advisor_context_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own advisor context preference"
  on public.advisor_context_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own advisor context preference"
  on public.advisor_context_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.advisor_context_preferences from public, anon;
grant select, insert, update on table public.advisor_context_preferences to authenticated;
grant all on table public.advisor_context_preferences to service_role;

create trigger advisor_context_preferences_touch
  before update on public.advisor_context_preferences
  for each row execute function public.touch_updated_at();