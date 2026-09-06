-- 1:1 private messaging. Third step of the Facebook-style social layer
-- (likes, follow, private messages).
--
-- Both sender_display_name and recipient_display_name are snapshotted at
-- send time, same reasoning as community_posts.author_display_name:
-- profiles' own RLS is "own row only", so there's no live join available for
-- either party's name. Snapshotting both sides (not just the sender) means
-- the conversation list and thread header can always show "who is this"
-- from the messages table alone - including the case where the last message
-- in a thread was sent by the *current* user, when only the sender's name
-- would be useless for identifying the other party.
--
-- No read receipts / edit history in v1 - a message is sent once and can
-- only be retracted (deleted) by its own sender, same "own content, own
-- delete" shape as community posts.

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_display_name text not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  recipient_display_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint direct_messages_not_self check (sender_id <> recipient_id),
  constraint direct_messages_body_not_blank check (btrim(body) <> ''),
  constraint direct_messages_body_length check (char_length(body) <= 2000),
  constraint direct_messages_sender_name_not_blank check (btrim(sender_display_name) <> ''),
  constraint direct_messages_recipient_name_not_blank check (btrim(recipient_display_name) <> '')
);

create index direct_messages_sender_idx on public.direct_messages (sender_id, created_at desc);
create index direct_messages_recipient_idx on public.direct_messages (recipient_id, created_at desc);
-- Serves "give me the thread between me and this one other user" regardless
-- of who sent which message, without needing an OR'd pair of indexes.
create index direct_messages_pair_idx
  on public.direct_messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);

alter table public.direct_messages enable row level security;

create policy "Participants read their own direct messages"
  on public.direct_messages for select
  to authenticated
  using ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id);

create policy "Users send direct messages as themselves"
  on public.direct_messages for insert
  to authenticated
  with check ((select auth.uid()) = sender_id);

create policy "Senders retract their own direct messages"
  on public.direct_messages for delete
  to authenticated
  using ((select auth.uid()) = sender_id);

revoke all on public.direct_messages from public, anon;
grant select, insert, delete on public.direct_messages to authenticated;
grant all on public.direct_messages to service_role;

comment on table public.direct_messages is
  '1:1 private messages. sender_display_name/recipient_display_name are point-in-time snapshots, not a live profiles join. No update path - only the sender can delete (retract) their own message.';
