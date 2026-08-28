-- Viora Advisor Conversations V1 persistence foundation.
-- The browser may read only its own rows. All mutations are reserved for the
-- authenticated server boundary, which derives user_id from the verified JWT.

create table public.advisor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  advisor_id text not null,
  title text,
  status text not null default 'active',
  is_current boolean not null default true,
  last_message_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advisor_conversations_advisor_id_check
    check (advisor_id in ('adam', 'daniel', 'maya', 'shiran')),
  constraint advisor_conversations_title_check
    check (title is null or (btrim(title) <> '' and char_length(title) <= 120)),
  constraint advisor_conversations_status_check
    check (status in ('active', 'archived', 'deleted')),
  constraint advisor_conversations_deleted_state_check
    check (
      (status = 'deleted' and deleted_at is not null and is_current = false)
      or
      (status <> 'deleted' and deleted_at is null)
    ),
  constraint advisor_conversations_current_state_check
    check (not is_current or status = 'active')
);

create unique index advisor_conversations_one_current_per_advisor
  on public.advisor_conversations (user_id, advisor_id)
  where is_current and deleted_at is null;

create index advisor_conversations_user_recent_idx
  on public.advisor_conversations (user_id, last_message_at desc nulls last, created_at desc);

create table public.advisor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.advisor_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  turn_id uuid not null,
  client_request_id uuid,
  retry_of_message_id uuid references public.advisor_messages(id) on delete set null,
  role text not null,
  content text not null,
  status text not null,
  ordinal bigint generated always as identity,
  provider text,
  model text,
  provider_response_id text,
  input_tokens integer,
  output_tokens integer,
  reasoning_tokens integer,
  total_tokens integer,
  safe_error_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
  constraint advisor_messages_role_check
    check (role in ('user', 'assistant')),
  constraint advisor_messages_content_check
    check (
      btrim(content) <> ''
      and char_length(content) <= case when role = 'user' then 4000 else 16000 end
    ),
  constraint advisor_messages_status_check
    check (
      status in (
        'pending_quota',
        'generating',
        'completed',
        'quota_rejected',
        'provider_failed',
        'finalize_failed',
        'interrupted'
      )
    ),
  constraint advisor_messages_client_request_check
    check (
      (role = 'user' and client_request_id is not null)
      or
      (role = 'assistant' and client_request_id is null)
    ),
  constraint advisor_messages_retry_role_check
    check (retry_of_message_id is null or role = 'user'),
  constraint advisor_messages_retry_not_self_check
    check (retry_of_message_id is null or retry_of_message_id <> id),
  constraint advisor_messages_provider_metadata_check
    check (
      role = 'assistant'
      or (
        provider is null
        and model is null
        and provider_response_id is null
        and input_tokens is null
        and output_tokens is null
        and reasoning_tokens is null
        and total_tokens is null
      )
    ),
  constraint advisor_messages_token_counts_check
    check (
      coalesce(input_tokens, 0) >= 0
      and coalesce(output_tokens, 0) >= 0
      and coalesce(reasoning_tokens, 0) >= 0
      and coalesce(total_tokens, 0) >= 0
    ),
  constraint advisor_messages_completion_state_check
    check (
      (status = 'completed' and completed_at is not null and failed_at is null)
      or
      (status in ('provider_failed', 'finalize_failed', 'interrupted')
        and failed_at is not null and completed_at is null)
      or
      (status in ('pending_quota', 'generating', 'quota_rejected')
        and completed_at is null and failed_at is null)
    )
);

create unique index advisor_messages_client_request_idempotency_idx
  on public.advisor_messages (conversation_id, client_request_id)
  where client_request_id is not null;

create unique index advisor_messages_one_role_per_turn_idx
  on public.advisor_messages (conversation_id, turn_id, role);

create unique index advisor_messages_conversation_ordinal_idx
  on public.advisor_messages (conversation_id, ordinal);

create index advisor_messages_user_recent_idx
  on public.advisor_messages (user_id, created_at desc);

create or replace function public.protect_advisor_conversation_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.id is distinct from old.id
    or new.advisor_id is distinct from old.advisor_id then
    raise exception 'Advisor conversation ownership is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.protect_advisor_message_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.id is distinct from old.id
    or new.conversation_id is distinct from old.conversation_id
    or new.turn_id is distinct from old.turn_id
    or new.role is distinct from old.role
    or new.ordinal is distinct from old.ordinal
    or new.client_request_id is distinct from old.client_request_id then
    raise exception 'Advisor message identity is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_advisor_message_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_retry_matches boolean;
begin
  select conversation.user_id
  into v_owner
  from public.advisor_conversations as conversation
  where conversation.id = new.conversation_id;

  if v_owner is null or v_owner is distinct from new.user_id then
    raise exception 'Advisor message owner does not match conversation owner';
  end if;

  if new.retry_of_message_id is not null then
    select exists (
      select 1
      from public.advisor_messages as retried
      where retried.id = new.retry_of_message_id
        and retried.conversation_id = new.conversation_id
        and retried.user_id = new.user_id
        and retried.role = 'user'
        and retried.status in ('provider_failed', 'finalize_failed', 'interrupted')
    ) into v_retry_matches;

    if not v_retry_matches then
      raise exception 'Advisor retry target is invalid';
    end if;
  end if;
  return new;
end;
$$;

create trigger advisor_conversations_protect_ownership
before update on public.advisor_conversations
for each row execute function public.protect_advisor_conversation_ownership();

create trigger advisor_conversations_updated_at
before update on public.advisor_conversations
for each row execute function public.touch_updated_at();

create trigger advisor_messages_protect_identity
before update on public.advisor_messages
for each row execute function public.protect_advisor_message_identity();

create trigger advisor_messages_enforce_owner
before insert or update on public.advisor_messages
for each row execute function public.enforce_advisor_message_owner();

create trigger advisor_messages_updated_at
before update on public.advisor_messages
for each row execute function public.touch_updated_at();

alter table public.advisor_conversations enable row level security;
alter table public.advisor_messages enable row level security;

revoke all on table public.advisor_conversations from public, anon, authenticated;
revoke all on table public.advisor_messages from public, anon, authenticated;
revoke all on sequence public.advisor_messages_ordinal_seq from public, anon, authenticated;

grant select on table public.advisor_conversations to authenticated;
grant select on table public.advisor_messages to authenticated;

grant select, insert, update, delete on table public.advisor_conversations to service_role;
grant select, insert, update, delete on table public.advisor_messages to service_role;
grant usage, select on sequence public.advisor_messages_ordinal_seq to service_role;

create policy "Users can read their own advisor conversations"
on public.advisor_conversations
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own advisor messages"
on public.advisor_messages
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke execute on function public.protect_advisor_conversation_ownership()
  from public, anon, authenticated;
revoke execute on function public.protect_advisor_message_identity()
  from public, anon, authenticated;
revoke execute on function public.enforce_advisor_message_owner()
  from public, anon, authenticated;

grant execute on function public.protect_advisor_conversation_ownership() to service_role;
grant execute on function public.protect_advisor_message_identity() to service_role;
grant execute on function public.enforce_advisor_message_owner() to service_role;

-- Complete a provider-successful turn and consume its Free quota in one DB transaction.
-- A null claim token is reserved for the already-authorized Admin server path.
create or replace function public.complete_advisor_turn(
  p_user_id uuid,
  p_user_message_id uuid,
  p_assistant_message_id uuid,
  p_claim_token uuid,
  p_content text,
  p_provider text,
  p_model text,
  p_provider_response_id text,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_reasoning_tokens integer default null,
  p_total_tokens integer default null
)
returns public.advisor_messages
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_usage_date date := (timezone('utc', v_now))::date;
  v_conversation_id uuid;
  v_turn_id uuid;
  v_updated integer;
  v_assistant public.advisor_messages;
begin
  select message.conversation_id, message.turn_id
  into v_conversation_id, v_turn_id
  from public.advisor_messages as message
  join public.advisor_conversations as conversation
    on conversation.id = message.conversation_id
    and conversation.user_id = message.user_id
  where message.id = p_user_message_id
    and message.user_id = p_user_id
    and message.role = 'user'
    and message.status = 'generating'
    and conversation.status = 'active'
    and conversation.deleted_at is null
  for update of message, conversation;

  if not found then
    raise exception 'Advisor turn is not eligible for completion';
  end if;

  if p_claim_token is not null then
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
  end if;

  update public.advisor_messages
  set status = 'completed', completed_at = v_now, failed_at = null
  where id = p_user_message_id and user_id = p_user_id;

  insert into public.advisor_messages (
    id,
    conversation_id,
    user_id,
    turn_id,
    role,
    content,
    status,
    provider,
    model,
    provider_response_id,
    input_tokens,
    output_tokens,
    reasoning_tokens,
    total_tokens,
    completed_at
  ) values (
    p_assistant_message_id,
    v_conversation_id,
    p_user_id,
    v_turn_id,
    'assistant',
    p_content,
    'completed',
    p_provider,
    p_model,
    p_provider_response_id,
    p_input_tokens,
    p_output_tokens,
    p_reasoning_tokens,
    p_total_tokens,
    v_now
  ) returning * into v_assistant;

  update public.advisor_conversations
  set last_message_at = v_now
  where id = v_conversation_id and user_id = p_user_id and deleted_at is null;

  return v_assistant;
end;
$$;

-- Record a safe failure and release any matching reservation atomically.
create or replace function public.fail_advisor_turn(
  p_user_id uuid,
  p_user_message_id uuid,
  p_claim_token uuid,
  p_status text,
  p_safe_error_category text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_usage_date date := (timezone('utc', v_now))::date;
  v_updated integer;
begin
  if p_status not in ('quota_rejected', 'provider_failed', 'finalize_failed', 'interrupted') then
    raise exception 'Unsupported advisor failure status';
  end if;

  update public.advisor_messages
  set
    status = p_status,
    safe_error_category = p_safe_error_category,
    failed_at = case when p_status = 'quota_rejected' then null else v_now end,
    completed_at = null
  where id = p_user_message_id
    and user_id = p_user_id
    and role = 'user'
    and status in ('pending_quota', 'generating');

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'Advisor turn is not eligible for failure transition';
  end if;

  if p_claim_token is not null then
    update public.advisor_daily_usage as usage
    set reservation_token = null, reservation_expires_at = null
    where usage.user_id = p_user_id
      and usage.usage_date = v_usage_date
      and usage.successful_questions = 0
      and usage.reservation_token = p_claim_token;
  end if;
end;
$$;

revoke execute on function public.complete_advisor_turn(
  uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, integer, integer
) from public, anon, authenticated;
revoke execute on function public.fail_advisor_turn(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.complete_advisor_turn(
  uuid, uuid, uuid, uuid, text, text, text, text, integer, integer, integer, integer
) to service_role;
grant execute on function public.fail_advisor_turn(uuid, uuid, uuid, text, text)
  to service_role;

-- Switch the current conversation and create its replacement atomically.
create or replace function public.create_advisor_conversation(
  p_id uuid,
  p_user_id uuid,
  p_advisor_id text,
  p_title text
)
returns public.advisor_conversations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation public.advisor_conversations;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_advisor_id, 0));

  update public.advisor_conversations
  set is_current = false
  where user_id = p_user_id
    and advisor_id = p_advisor_id
    and is_current
    and deleted_at is null;

  insert into public.advisor_conversations (
    id, user_id, advisor_id, title, is_current, last_message_at
  ) values (
    p_id, p_user_id, p_advisor_id, p_title, true, statement_timestamp()
  ) returning * into v_conversation;

  return v_conversation;
end;
$$;

revoke execute on function public.create_advisor_conversation(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_advisor_conversation(uuid, uuid, text, text)
  to service_role;
