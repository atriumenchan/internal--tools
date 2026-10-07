-- Paste in the Supabase SQL editor. Safe to re-run.
-- Chat messages can carry one photo or file. Inbox preview says Photo when there is no caption.

alter table public.messages add column if not exists file_path text;
alter table public.messages add column if not exists file_name text;
alter table public.messages add column if not exists file_type text;
alter table public.messages add column if not exists file_size integer;
alter table public.messages add column if not exists storage text not null default 'supabase';

alter table public.messages alter column body set default '';

insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 8388608)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "chat files select" on storage.objects;
drop policy if exists "chat files insert" on storage.objects;
drop policy if exists "chat files delete" on storage.objects;

create policy "chat files select" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-files' and (public.has_signed_handbook() or public.is_admin()));

create policy "chat files insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-files' and (public.has_signed_handbook() or public.is_admin()));

create policy "chat files delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-files' and (public.has_signed_handbook() or public.is_admin()));

create or replace function public.chat_inbox()
returns table (
  conversation_id uuid,
  unread_count integer,
  last_body text,
  last_at timestamptz,
  last_author_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cm.conversation_id,
    (
      select count(*)::int
      from public.messages m
      where m.conversation_id = cm.conversation_id
        and m.author_id <> auth.uid()
        and m.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz)
    ) as unread_count,
    (
      select
        case
          when nullif(trim(m.body), '') is not null then m.body
          when coalesce(m.file_type, '') like 'image/%' then 'Photo'
          when m.file_name is not null then m.file_name
          else m.body
        end
      from public.messages m
      where m.conversation_id = cm.conversation_id
      order by m.created_at desc
      limit 1
    ) as last_body,
    (select m.created_at from public.messages m
      where m.conversation_id = cm.conversation_id
      order by m.created_at desc limit 1) as last_at,
    (select m.author_id from public.messages m
      where m.conversation_id = cm.conversation_id
      order by m.created_at desc limit 1) as last_author_id
  from public.conversation_members cm
  where cm.user_id = auth.uid();
$$;

grant execute on function public.chat_inbox() to authenticated;
