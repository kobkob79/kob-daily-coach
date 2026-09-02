-- Private per-user exercise notes and optional equipment/machine profiles.
--
-- Exercise deletion is deliberately RESTRICTED. An exercise with user-authored
-- information must be archived or explicitly migrated; deleting it must never
-- silently erase that information.

create table public.exercise_equipment_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_equipment_profiles_name_check check (
    name = btrim(name)
    and char_length(name) between 1 and 80
  ),
  constraint exercise_equipment_profiles_identity_unique
    unique (id, user_id, exercise_id)
);

create unique index exercise_equipment_profiles_one_default_idx
  on public.exercise_equipment_profiles (user_id, exercise_id)
  where is_default;

create index exercise_equipment_profiles_user_exercise_idx
  on public.exercise_equipment_profiles (user_id, exercise_id, created_at);

create table public.exercise_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  equipment_profile_id uuid,
  category text not null,
  text_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_insights_category_check check (
    category in (
      'machine_setup',
      'working_weight',
      'technique',
      'pain_sensitivity',
      'range_of_motion',
      'other'
    )
  ),
  constraint exercise_insights_text_value_check check (
    text_value = btrim(text_value)
    and char_length(text_value) between 1 and 160
  ),
  constraint exercise_insights_profile_scope_fk
    foreign key (equipment_profile_id, user_id, exercise_id)
    references public.exercise_equipment_profiles (id, user_id, exercise_id)
    on update restrict
    on delete restrict
);

-- Profile-specific values: one current value for a category on that exact
-- user/exercise/profile tuple.
create unique index exercise_insights_profile_category_unique_idx
  on public.exercise_insights (user_id, exercise_id, equipment_profile_id, category)
  where equipment_profile_id is not null;

-- General values: PostgreSQL normally treats NULLs as distinct in a unique
-- index, so use a dedicated partial index to make NULL profile an explicit,
-- singular scope per user/exercise/category.
create unique index exercise_insights_general_category_unique_idx
  on public.exercise_insights (user_id, exercise_id, category)
  where equipment_profile_id is null;

create index exercise_insights_user_exercise_idx
  on public.exercise_insights (user_id, exercise_id, created_at);

create trigger exercise_equipment_profiles_updated_at
  before update on public.exercise_equipment_profiles
  for each row execute function public.touch_updated_at();

create trigger exercise_insights_updated_at
  before update on public.exercise_insights
  for each row execute function public.touch_updated_at();

alter table public.exercise_equipment_profiles enable row level security;
alter table public.exercise_insights enable row level security;

revoke all on table public.exercise_equipment_profiles from public, anon, authenticated;
revoke all on table public.exercise_insights from public, anon, authenticated;

grant select, insert, update, delete
  on table public.exercise_equipment_profiles to authenticated;
grant select, insert, update, delete
  on table public.exercise_insights to authenticated;

grant select, insert, update, delete
  on table public.exercise_equipment_profiles to service_role;
grant select, insert, update, delete
  on table public.exercise_insights to service_role;

create policy "Users read own equipment profiles"
  on public.exercise_equipment_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own equipment profiles"
  on public.exercise_equipment_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own equipment profiles"
  on public.exercise_equipment_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own equipment profiles"
  on public.exercise_equipment_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own exercise insights"
  on public.exercise_insights for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create own exercise insights"
  on public.exercise_insights for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update own exercise insights"
  on public.exercise_insights for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete own exercise insights"
  on public.exercise_insights for delete to authenticated
  using ((select auth.uid()) = user_id);
