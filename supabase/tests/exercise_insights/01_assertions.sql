-- Run after 00_fixture.sql and the exercise-insights migration.
-- Every failure raises TEST FAILED and psql must run with ON_ERROR_STOP=1.

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');

insert into public.exercises (id) values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');

insert into public.exercise_equipment_profiles
  (id, user_id, exercise_id, name, is_default, updated_at)
values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'מכשיר ראשי', true, now() - interval '1 second'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'מכשיר של משתמש ב', true, now() - interval '1 second'),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'מכשיר לתרגיל אחר', true, now() - interval '1 second');

insert into public.exercise_insights
  (id, user_id, exercise_id, equipment_profile_id, category, text_value)
values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', null, 'technique', 'צוואר ישר'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', null, 'technique', 'מידע פרטי של משתמש ב');

-- 1-3. Owner isolation for SELECT and writes.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);

do $$
declare
  v_updated integer;
  v_deleted integer;
begin
  if (select count(*) from public.exercise_equipment_profiles) <> 2 then
    raise exception 'TEST FAILED: user A profile SELECT scope is incorrect';
  end if;
  if (select count(*) from public.exercise_insights) <> 1 then
    raise exception 'TEST FAILED: user A insight SELECT scope is incorrect';
  end if;

  begin
    insert into public.exercise_equipment_profiles (user_id, exercise_id, name)
    values ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'זיוף');
    raise exception 'TEST FAILED: user A inserted a user B profile';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.exercise_insights
      (user_id, exercise_id, category, text_value)
    values
      ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
       'working_weight', 'זיוף בעלות');
    raise exception 'TEST FAILED: user A inserted a user B insight';
  exception when insufficient_privilege then null; end;

  begin
    update public.exercise_equipment_profiles
    set user_id = '00000000-0000-0000-0000-000000000002'
    where id = '20000000-0000-0000-0000-000000000003';
    raise exception 'TEST FAILED: user A reassigned an owned profile to user B';
  exception when insufficient_privilege then null; end;

  begin
    update public.exercise_insights
    set user_id = '00000000-0000-0000-0000-000000000002'
    where id = '30000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED: user A reassigned an owned insight to user B';
  exception when insufficient_privilege then null; end;

  update public.exercise_insights
  set text_value = 'זיוף'
  where id = '30000000-0000-0000-0000-000000000002';
  get diagnostics v_updated = row_count;
  if v_updated <> 0 then
    raise exception 'TEST FAILED: user A updated a user B insight';
  end if;

  delete from public.exercise_equipment_profiles
  where id = '20000000-0000-0000-0000-000000000002';
  get diagnostics v_deleted = row_count;
  if v_deleted <> 0 then
    raise exception 'TEST FAILED: user A deleted a user B profile';
  end if;

  delete from public.exercise_insights
  where id = '30000000-0000-0000-0000-000000000002';
  get diagnostics v_deleted = row_count;
  if v_deleted <> 0 then
    raise exception 'TEST FAILED: user A deleted a user B insight';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

do $$
begin
  if not exists (
    select 1 from public.exercise_equipment_profiles
    where id = '20000000-0000-0000-0000-000000000002'
      and user_id = '00000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'TEST FAILED: user B profile changed after denied mutation';
  end if;
  if not exists (
    select 1 from public.exercise_equipment_profiles
    where id = '20000000-0000-0000-0000-000000000003'
      and user_id = '00000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'TEST FAILED: owned profile changed after denied user reassignment';
  end if;
  if not exists (
    select 1 from public.exercise_insights
    where id = '30000000-0000-0000-0000-000000000002'
      and user_id = '00000000-0000-0000-0000-000000000002'
      and text_value = 'מידע פרטי של משתמש ב'
  ) then
    raise exception 'TEST FAILED: user B insight changed after denied mutation';
  end if;
  if not exists (
    select 1 from public.exercise_insights
    where id = '30000000-0000-0000-0000-000000000001'
      and user_id = '00000000-0000-0000-0000-000000000001'
      and text_value = 'צוואר ישר'
  ) then
    raise exception 'TEST FAILED: owned insight changed after denied user reassignment';
  end if;
end $$;

-- 4-5. Composite FK enforces profile owner and exercise scope.
do $$
begin
  begin
    insert into public.exercise_insights
      (user_id, exercise_id, equipment_profile_id, category, text_value)
    values
      ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000002', 'machine_setup', 'אסור');
    raise exception 'TEST FAILED: cross-user profile reference succeeded';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.exercise_insights
      (user_id, exercise_id, equipment_profile_id, category, text_value)
    values
      ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000003', 'machine_setup', 'אסור');
    raise exception 'TEST FAILED: cross-exercise profile reference succeeded';
  exception when restrict_violation or foreign_key_violation then null; end;
end $$;

-- 6. One default profile per user/exercise.
do $$
begin
  begin
    insert into public.exercise_equipment_profiles (user_id, exercise_id, name, is_default)
    values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'ברירת מחדל שנייה', true);
    raise exception 'TEST FAILED: second default profile succeeded';
  exception when unique_violation then null; end;
end $$;

-- 7-8. Profile-specific and NULL-profile uniqueness are both explicit.
insert into public.exercise_insights
  (user_id, exercise_id, equipment_profile_id, category, text_value)
values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'machine_setup', 'גובה כיסא: 4');

-- A referenced profile cannot move to another exercise because the composite
-- identity is protected by the dependent insight foreign key.
do $$
begin
  begin
    update public.exercise_equipment_profiles
    set exercise_id = '10000000-0000-0000-0000-000000000002',
        is_default = false
    where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED: referenced profile exercise reassignment succeeded';
  exception when restrict_violation or foreign_key_violation then null; end;

  if not exists (
    select 1 from public.exercise_equipment_profiles
    where id = '20000000-0000-0000-0000-000000000001'
      and exercise_id = '10000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'TEST FAILED: profile changed after denied exercise reassignment';
  end if;
  if not exists (
    select 1 from public.exercise_insights
    where equipment_profile_id = '20000000-0000-0000-0000-000000000001'
      and exercise_id = '10000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'TEST FAILED: insight changed after denied profile exercise reassignment';
  end if;
end $$;

do $$
begin
  begin
    insert into public.exercise_insights
      (user_id, exercise_id, equipment_profile_id, category, text_value)
    values
      ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
       '20000000-0000-0000-0000-000000000001', 'machine_setup', 'כפילות');
    raise exception 'TEST FAILED: duplicate profile-specific category succeeded';
  exception when unique_violation then null; end;

  begin
    insert into public.exercise_insights
      (user_id, exercise_id, equipment_profile_id, category, text_value)
    values
      ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
       null, 'technique', 'כפילות כללית');
    raise exception 'TEST FAILED: duplicate NULL-profile category succeeded';
  exception when unique_violation then null; end;
end $$;

-- 9-12. Text and category checks.
do $$
declare
  v_category text;
begin
  foreach v_category in array array[
    'machine_setup', 'working_weight', 'technique', 'pain_sensitivity',
    'range_of_motion', 'other'
  ] loop
    insert into public.exercise_insights
      (user_id, exercise_id, category, text_value)
    values
      ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002',
       v_category, 'ערך תקין ' || v_category);
  end loop;

  begin
    insert into public.exercise_insights (user_id, exercise_id, category, text_value)
    values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'other', '');
    raise exception 'TEST FAILED: empty text succeeded';
  exception when check_violation then null; end;

  begin
    insert into public.exercise_insights (user_id, exercise_id, category, text_value)
    values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'other', '   ');
    raise exception 'TEST FAILED: whitespace text succeeded';
  exception when check_violation then null; end;

  begin
    insert into public.exercise_insights (user_id, exercise_id, category, text_value)
    values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'other', repeat('א', 161));
    raise exception 'TEST FAILED: text longer than 160 succeeded';
  exception when check_violation then null; end;

  begin
    insert into public.exercise_insights (user_id, exercise_id, category, text_value)
    values ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'unknown', 'אסור');
    raise exception 'TEST FAILED: unknown category succeeded';
  exception when check_violation then null; end;
end $$;

-- 13. Existing trigger convention updates updated_at.
do $$
declare
  v_before timestamptz;
  v_after timestamptz;
begin
  select updated_at into v_before from public.exercise_equipment_profiles
  where id = '20000000-0000-0000-0000-000000000001';

  update public.exercise_equipment_profiles
  set name = 'מכשיר ראשי מעודכן'
  where id = '20000000-0000-0000-0000-000000000001';
  select updated_at into v_after from public.exercise_equipment_profiles
  where id = '20000000-0000-0000-0000-000000000001';

  if v_after <= v_before then
    raise exception 'TEST FAILED: updated_at did not advance';
  end if;
end $$;

-- 14-15. Anonymous denial and explicit privilege matrix.
set role anon;
select set_config('request.jwt.claim.sub', '', false);

do $$
begin
  begin
    perform count(*) from public.exercise_insights;
    raise exception 'TEST FAILED: anon SELECT succeeded';
  exception when insufficient_privilege then null; end;
end $$;

reset role;

do $$
declare
  v_table text;
  v_privilege text;
begin
  foreach v_table in array array['exercise_equipment_profiles', 'exercise_insights'] loop
    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('anon', 'public.' || v_table, v_privilege) then
        raise exception 'TEST FAILED: anon has % on %', v_privilege, v_table;
      end if;
      if not has_table_privilege('authenticated', 'public.' || v_table, v_privilege) then
        raise exception 'TEST FAILED: authenticated lacks % on %', v_privilege, v_table;
      end if;
      if not has_table_privilege('service_role', 'public.' || v_table, v_privilege) then
        raise exception 'TEST FAILED: service_role lacks % on %', v_privilege, v_table;
      end if;
    end loop;
  end loop;
end $$;

-- Exercise deletion is explicitly configured as RESTRICT so user information
-- cannot be erased as an accidental side effect of deleting the exercise.
do $$
begin
  if (
    select count(*)
    from pg_constraint
    where contype = 'f'
      and conname in (
        'exercise_equipment_profiles_exercise_id_fkey',
        'exercise_insights_exercise_id_fkey'
      )
      and confdeltype = 'r'
  ) <> 2 then
    raise exception 'TEST FAILED: exercise foreign keys are not both ON DELETE RESTRICT';
  end if;
end $$;

-- Supporting indexes exist for every non-leading foreign-key lookup path.
do $$
begin
  if (
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'exercise_equipment_profiles_exercise_id_idx',
        'exercise_insights_exercise_id_idx',
        'exercise_insights_equipment_profile_id_idx'
      )
  ) <> 3 then
    raise exception 'TEST FAILED: supporting foreign-key indexes are incomplete';
  end if;
end $$;

do $$
begin
  raise notice 'ALL EXERCISE INSIGHTS DATA FOUNDATION ASSERTIONS PASSED';
end $$;
