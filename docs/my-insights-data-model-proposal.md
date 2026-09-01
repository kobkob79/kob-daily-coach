# My Insights Data Model & RLS Design (Proposal)

## Overview

Supabase is the intended source of truth for "התובנות שלי" (My Insights). Every record must be strictly scoped by `user_id` and `exercise_id`.

## Proposed Data Model

Two primary tables are proposed to manage insights and profiles:

### 1. `exercise_equipment_profiles`
Stores user-defined equipment profiles for specific exercises.
- `id` (UUID, PK)
- `user_id` (UUID, FK to auth.users)
- `exercise_id` (UUID, FK to exercises)
- `name` (String, e.g., "ICON", "המכשיר השחור")
- `is_default` (Boolean)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

### 2. `exercise_insights`
Stores individual insights, settings, notes, and sensitivities.
- `id` (UUID, PK)
- `user_id` (UUID, FK to auth.users)
- `exercise_id` (UUID, FK to exercises)
- `profile_id` (UUID, FK to exercise_equipment_profiles, nullable - if null, applies generally to the exercise)
- `category` (String / Enum: e.g., 'seat_height', 'backrest_position', 'personal_note', 'sensitivity')
- `value` (Text)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

## Required Constraints and Validation

The final implementation must guarantee data integrity and ownership:

- **Cross-Reference Prevention:** An insight must not reference an equipment profile owned by another user or belonging to another exercise. The final schema or application logic must enforce that `profile.user_id = insight.user_id` and `profile.exercise_id = insight.exercise_id`.
- **Equipment Settings Uniqueness:** Each user may have only one current equipment-setting value per exercise, equipment profile, and category.
- **Default Profile Uniqueness:** Each user may have only one default equipment profile per exercise.
- **Null Profile Uniqueness Strategy:** General insights with a null profile require an explicit uniqueness strategy, because normal SQL NULL behavior does not guarantee uniqueness in composite constraints.

*Note: Exact SQL and final table names to enforce these constraints remain Open Decisions and will not be implemented in this documentation sprint.*

## Row Level Security (RLS) Design

Strict RLS policies must be applied to both tables to guarantee privacy.

- **Enable RLS:** `ALTER TABLE exercise_equipment_profiles ENABLE ROW LEVEL SECURITY;`
- **Enable RLS:** `ALTER TABLE exercise_insights ENABLE ROW LEVEL SECURITY;`

**Policy Definition (applies to both tables):**
- **SELECT:** `CREATE POLICY select_own ON <table_name> FOR SELECT USING (auth.uid() = user_id);`
- **INSERT:** `CREATE POLICY insert_own ON <table_name> FOR INSERT WITH CHECK (auth.uid() = user_id);`
- **UPDATE:** `CREATE POLICY update_own ON <table_name> FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);`
- **DELETE:** `CREATE POLICY delete_own ON <table_name> FOR DELETE USING (auth.uid() = user_id);`

**Rules:**
- RLS must allow only the owning user to read, create, update, and delete their records.
- Do not query or inspect production user data directly.

## Open Decisions

- Final table names and exact migration SQL.
