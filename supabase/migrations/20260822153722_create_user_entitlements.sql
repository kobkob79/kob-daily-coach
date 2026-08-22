-- Premium entitlement source of truth. Clients never access this table
-- directly; authenticated users receive a safe projection from server code.

create table public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_key text not null,
  status text not null,
  source text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  granted_by uuid references auth.users(id) on delete set null,
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_entitlements_user_key_unique unique (user_id, entitlement_key),
  constraint user_entitlements_key_check
    check (entitlement_key = 'premium_ai'),
  constraint user_entitlements_status_check
    check (status in ('active', 'trialing', 'expired', 'revoked')),
  constraint user_entitlements_source_check
    check (source in ('manual', 'billing', 'trial')),
  constraint user_entitlements_time_range_check
    check (expires_at is null or expires_at > starts_at),
  constraint user_entitlements_trial_expiry_check
    check (status <> 'trialing' or expires_at is not null)
);

create unique index user_entitlements_external_reference_unique
  on public.user_entitlements (source, external_reference)
  where external_reference is not null;

alter table public.user_entitlements enable row level security;

revoke all on table public.user_entitlements from public, anon, authenticated;
grant select, insert, update, delete on table public.user_entitlements to service_role;

create trigger user_entitlements_updated_at
before update on public.user_entitlements
for each row execute function public.touch_updated_at();

comment on table public.user_entitlements is
  'Server-managed source of truth for Viora product entitlements.';
