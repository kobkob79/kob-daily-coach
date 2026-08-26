-- Guarded Core 150 #22 identity deduplication.
--
-- Canonical survivor:
--   531597e6-4b9c-4852-9673-3f7199e5d78b | חתירה בישיבה בכבל
-- Redundant shared row:
--   03ff0581-cacd-4ff8-a3a5-04683f7d968e | Seated Cable Row
--
-- Captured rollback data (production preflight 2026-08-25):
--   Redundant exercise row:
--     id           = 03ff0581-cacd-4ff8-a3a5-04683f7d968e
--     owner_id     = null
--     name         = Seated Cable Row
--     muscle_group = גב
--     category     = pull
--     equipment    = cable
--     description  = Neutral grip row
--     default_sets = 3
--     default_reps = 10
--     image_path   = /images/exercises/Back/seated-cable-row.png
--     created_at   = 2026-07-01 22:52:02.364231+00
--     updated_at   = 2026-07-03 04:50:05.820117+00
--   Workout-set rows to restore to the redundant id if a post-commit rollback is required:
--     b6d6b3d2-cd28-4d18-9257-2fad0861e527
--     7f254e32-5bae-497d-95f7-ac3c885fecf9
--     085ce7ea-5ec9-43dc-a498-228c980ea082
--   Workout-template-exercise row to restore:
--     c9893d3a-946e-4631-ac03-0248e08f6399
--   Survivor values before this migration:
--     equipment   = null
--     description = null
--
-- Before COMMIT, any failure below rolls the whole migration back automatically.
-- A post-commit rollback must reinsert the captured redundant exercise row, repoint only
-- the four captured child-row ids, and restore the survivor's two nullable fields to null.

begin;

-- Prevent new exercise references from appearing between the drift checks and the delete.
lock table public.exercises,
           public.workout_sets,
           public.workout_template_exercises
in share row exclusive mode;

do $deduplicate_core_150_exercise_22$
declare
  survivor_id constant uuid := '531597e6-4b9c-4852-9673-3f7199e5d78b';
  redundant_id constant uuid := '03ff0581-cacd-4ff8-a3a5-04683f7d968e';
  actual_count bigint;
  affected_count bigint;
begin
  select count(*)
    into actual_count
    from public.exercises
   where id = survivor_id
     and name = 'חתירה בישיבה בכבל'
     and owner_id is null;
  if actual_count <> 1 then
    raise exception 'Core 150 #22 drift: expected exactly one shared survivor row, found %', actual_count;
  end if;

  select count(*)
    into actual_count
    from public.exercises
   where id = redundant_id
     and name = 'Seated Cable Row'
     and owner_id is null;
  if actual_count <> 1 then
    raise exception 'Core 150 #22 drift: expected exactly one shared redundant row, found %', actual_count;
  end if;

  select count(*) into actual_count
    from public.workout_sets
   where exercise_id = survivor_id;
  if actual_count <> 37 then
    raise exception 'Core 150 #22 drift: expected 37 survivor workout_sets, found %', actual_count;
  end if;

  select count(*) into actual_count
    from public.workout_template_exercises
   where exercise_id = survivor_id;
  if actual_count <> 1 then
    raise exception 'Core 150 #22 drift: expected 1 survivor workout_template_exercises row, found %', actual_count;
  end if;

  select count(*) into actual_count
    from public.workout_sets
   where exercise_id = redundant_id;
  if actual_count <> 3 then
    raise exception 'Core 150 #22 drift: expected 3 redundant workout_sets, found %', actual_count;
  end if;

  select count(*) into actual_count
    from public.workout_template_exercises
   where exercise_id = redundant_id;
  if actual_count <> 1 then
    raise exception 'Core 150 #22 drift: expected 1 redundant workout_template_exercises row, found %', actual_count;
  end if;

  -- Counts alone are insufficient: the exact child rows captured during preflight must
  -- still be the only rows that reference the redundant identity.
  select count(*)
    into actual_count
    from public.workout_sets
   where exercise_id = redundant_id
     and id = any(array[
       'b6d6b3d2-cd28-4d18-9257-2fad0861e527'::uuid,
       '7f254e32-5bae-497d-95f7-ac3c885fecf9'::uuid,
       '085ce7ea-5ec9-43dc-a498-228c980ea082'::uuid
     ]);
  if actual_count <> 3 then
    raise exception 'Core 150 #22 drift: only % of 3 expected workout_set ids still point to the redundant exercise', actual_count;
  end if;

  select count(*)
    into actual_count
    from public.workout_sets
   where exercise_id = redundant_id
     and not (id = any(array[
       'b6d6b3d2-cd28-4d18-9257-2fad0861e527'::uuid,
       '7f254e32-5bae-497d-95f7-ac3c885fecf9'::uuid,
       '085ce7ea-5ec9-43dc-a498-228c980ea082'::uuid
     ]));
  if actual_count <> 0 then
    raise exception 'Core 150 #22 drift: % unexpected workout_set ids point to the redundant exercise', actual_count;
  end if;

  select count(*)
    into actual_count
    from public.workout_template_exercises
   where exercise_id = redundant_id
     and id = 'c9893d3a-946e-4631-ac03-0248e08f6399'::uuid;
  if actual_count <> 1 then
    raise exception 'Core 150 #22 drift: the expected workout_template_exercises row no longer points to the redundant exercise';
  end if;

  select count(*)
    into actual_count
    from public.workout_template_exercises
   where exercise_id = redundant_id
     and id <> 'c9893d3a-946e-4631-ac03-0248e08f6399'::uuid;
  if actual_count <> 0 then
    raise exception 'Core 150 #22 drift: % unexpected workout_template_exercises rows point to the redundant exercise', actual_count;
  end if;

  -- The rollback record assumes these survivor values are still null. Abort instead of
  -- applying stale metadata assumptions if either field changed after preflight.
  select count(*)
    into actual_count
    from public.exercises
   where id = survivor_id
     and equipment is null
     and description is null;
  if actual_count <> 1 then
    raise exception 'Core 150 #22 drift: survivor equipment or description changed after preflight';
  end if;

  -- Validate the meaningful redundant metadata that is either preserved or intentionally
  -- discarded. Timestamp equality is not required for identity safety.
  select count(*)
    into actual_count
    from public.exercises
   where id = redundant_id
     and equipment = 'cable'
     and description = 'Neutral grip row'
     and muscle_group = 'גב'
     and category = 'pull'
     and default_sets = 3
     and default_reps = 10
     and image_path = '/images/exercises/Back/seated-cable-row.png';
  if actual_count <> 1 then
    raise exception 'Core 150 #22 drift: redundant exercise metadata changed after preflight';
  end if;

  -- Repointing must not violate (session_id, exercise_id, set_number).
  -- PostgreSQL unique indexes permit multiple null session_id values, so only non-null
  -- sessions can collide with this exact unique key.
  select count(*)
    into actual_count
    from public.workout_sets source
    join public.workout_sets target
      on target.session_id = source.session_id
     and target.exercise_id = survivor_id
     and target.set_number = source.set_number
   where source.exercise_id = redundant_id
     and source.session_id is not null;
  if actual_count <> 0 then
    raise exception 'Core 150 #22 collision: % workout_sets would duplicate the survivor unique key', actual_count;
  end if;

  -- Abort if both identities unexpectedly occur inside the same template.
  select count(*)
    into actual_count
    from public.workout_template_exercises source
    join public.workout_template_exercises target
      on target.template_id = source.template_id
     and target.exercise_id = survivor_id
   where source.exercise_id = redundant_id;
  if actual_count <> 0 then
    raise exception 'Core 150 #22 collision: % templates already contain both identities', actual_count;
  end if;

  -- No unique index other than the primary key may unexpectedly govern exercise_id on
  -- workout_template_exercises. This guards against schema drift after the preflight.
  select count(*)
    into actual_count
    from pg_index index_definition
    join pg_attribute indexed_attribute
      on indexed_attribute.attrelid = index_definition.indrelid
     and indexed_attribute.attnum = any(index_definition.indkey)
   where index_definition.indrelid = 'public.workout_template_exercises'::regclass
     and index_definition.indisunique
     and not index_definition.indisprimary
     and indexed_attribute.attname = 'exercise_id';
  if actual_count <> 0 then
    raise exception 'Core 150 #22 schema drift: found % unexpected unique exercise_id indexes on workout_template_exercises', actual_count;
  end if;

  update public.exercises
     set equipment = coalesce(equipment, 'cable'),
         description = coalesce(description, 'Neutral grip row')
   where id = survivor_id
     and name = 'חתירה בישיבה בכבל'
     and owner_id is null;
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'Core 150 #22 mutation failure: expected to preserve metadata on one survivor row, updated %', affected_count;
  end if;

  update public.workout_sets
     set exercise_id = survivor_id
   where exercise_id = redundant_id;
  get diagnostics affected_count = row_count;
  if affected_count <> 3 then
    raise exception 'Core 150 #22 mutation failure: expected to repoint 3 workout_sets, updated %', affected_count;
  end if;

  update public.workout_template_exercises
     set exercise_id = survivor_id
   where exercise_id = redundant_id;
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'Core 150 #22 mutation failure: expected to repoint 1 workout_template_exercises row, updated %', affected_count;
  end if;

  select
    (select count(*) from public.workout_sets where exercise_id = redundant_id)
    +
    (select count(*) from public.workout_template_exercises where exercise_id = redundant_id)
    into actual_count;
  if actual_count <> 0 then
    raise exception 'Core 150 #22 mutation failure: % references still point to the redundant id', actual_count;
  end if;

  delete from public.exercises
   where id = redundant_id
     and owner_id is null
     and name = 'Seated Cable Row';
  get diagnostics affected_count = row_count;
  if affected_count <> 1 then
    raise exception 'Core 150 #22 mutation failure: expected to delete exactly one redundant row, deleted %', affected_count;
  end if;

  select count(*) into actual_count
    from public.workout_sets
   where exercise_id = survivor_id;
  if actual_count <> 40 then
    raise exception 'Core 150 #22 verification failure: expected 40 survivor workout_sets, found %', actual_count;
  end if;

  select count(*) into actual_count
    from public.workout_template_exercises
   where exercise_id = survivor_id;
  if actual_count <> 2 then
    raise exception 'Core 150 #22 verification failure: expected 2 survivor workout_template_exercises rows, found %', actual_count;
  end if;

  select count(*) into actual_count
    from public.exercises
   where id = redundant_id;
  if actual_count <> 0 then
    raise exception 'Core 150 #22 verification failure: redundant exercise still exists';
  end if;

  select count(*) into actual_count
    from public.exercises
   where id = survivor_id
     and name = 'חתירה בישיבה בכבל'
     and owner_id is null;
  if actual_count <> 1 then
    raise exception 'Core 150 #22 verification failure: expected exactly one shared survivor row, found %', actual_count;
  end if;
end;
$deduplicate_core_150_exercise_22$;

commit;
