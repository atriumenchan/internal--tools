-- =============================================================================
-- Notifications, company credentials vault, task file metadata, chat inbox
-- Paste this whole file into SQL Editor and run it (do NOT run reset.sql).
-- After this, also confirm Storage → Buckets includes "task-files" (created below).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "read own notifications" on public.notifications;
drop policy if exists "update own notifications" on public.notifications;
create policy "read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "update own notifications" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, update on public.notifications to authenticated;

create or replace function public.actor_label(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(full_name), ''), email, 'Someone')
  from public.profiles
  where id = p_user_id;
$$;

create or replace function public.push_notification(
  p_user_id uuid,
  p_actor_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_href text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_user_id = p_actor_id then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, title, body, href)
  values (p_user_id, p_actor_id, p_type, p_title, left(coalesce(p_body, ''), 280), p_href);
end;
$$;

create or replace function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_name text;
  v_title text;
begin
  v_name := public.actor_label(new.author_id);
  for r in
    select cm.user_id, c.type, c.name
    from public.conversation_members cm
    join public.conversations c on c.id = cm.conversation_id
    where cm.conversation_id = new.conversation_id
      and cm.user_id <> new.author_id
  loop
    if r.type = 'dm' then
      v_title := v_name || ' messaged you';
    else
      v_title := v_name || ' messaged in ' || coalesce(nullif(r.name, ''), 'a chat');
    end if;
    perform public.push_notification(
      r.user_id,
      new.author_id,
      'message',
      v_title,
      new.body,
      '/chat?c=' || new.conversation_id::text
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_on_message();

create or replace function public.notify_on_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.assignee_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id then
    return new;
  end if;
  v_name := public.actor_label(new.created_by);
  perform public.push_notification(
    new.assignee_id,
    coalesce(new.created_by, auth.uid()),
    'task_assigned',
    v_name || ' assigned you a task',
    new.title,
    '/spaces/' || new.space_id::text || '/tasks/' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify
  after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_on_task();

create or replace function public.notify_on_task_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tasks;
  v_name text;
begin
  select * into t from public.tasks where id = new.task_id;
  if not found then
    return new;
  end if;
  v_name := public.actor_label(new.author_id);
  if t.assignee_id is not null then
    perform public.push_notification(
      t.assignee_id,
      new.author_id,
      'task_comment',
      v_name || ' commented on a task assigned to you',
      new.body,
      '/spaces/' || t.space_id::text || '/tasks/' || t.id::text
    );
  end if;
  if t.created_by is not null and t.created_by is distinct from t.assignee_id then
    perform public.push_notification(
      t.created_by,
      new.author_id,
      'task_comment',
      v_name || ' commented on a task you created',
      new.body,
      '/spaces/' || t.space_id::text || '/tasks/' || t.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists task_comments_notify on public.task_comments;
create trigger task_comments_notify
  after insert on public.task_comments
  for each row execute function public.notify_on_task_comment();

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.notifications
  where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_notifications_read()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

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
    (select m.body from public.messages m
      where m.conversation_id = cm.conversation_id
      order by m.created_at desc limit 1) as last_body,
    (select m.created_at from public.messages m
      where m.conversation_id = cm.conversation_id
      order by m.created_at desc limit 1) as last_at,
    (select m.author_id from public.messages m
      where m.conversation_id = cm.conversation_id
      order by m.created_at desc limit 1) as last_author_id
  from public.conversation_members cm
  where cm.user_id = auth.uid();
$$;

grant execute on function public.unread_notification_count() to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
grant execute on function public.chat_inbox() to authenticated;

-- -----------------------------------------------------------------------------
-- Company credentials (shared notebook — not a password manager)
-- -----------------------------------------------------------------------------
create table if not exists public.company_credentials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  username text,
  secret text,
  url text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists company_credentials_updated_at on public.company_credentials;
create trigger company_credentials_updated_at
  before update on public.company_credentials
  for each row execute function public.set_updated_at();

alter table public.company_credentials enable row level security;

drop policy if exists "staff read credentials" on public.company_credentials;
drop policy if exists "staff write credentials" on public.company_credentials;
create policy "staff read credentials" on public.company_credentials
  for select to authenticated
  using (public.has_signed_handbook() or public.is_admin());
create policy "staff write credentials" on public.company_credentials
  for all to authenticated
  using (public.has_signed_handbook() or public.is_admin())
  with check (public.has_signed_handbook() or public.is_admin());

grant select, insert, update, delete on public.company_credentials to authenticated;

-- -----------------------------------------------------------------------------
-- Task file metadata
-- -----------------------------------------------------------------------------
create table if not exists public.task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  path text not null unique,
  file_name text not null,
  file_size integer not null default 0,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists task_files_task_idx on public.task_files (task_id);

alter table public.task_files enable row level security;

drop policy if exists "members read task files" on public.task_files;
drop policy if exists "members insert task files" on public.task_files;
drop policy if exists "members delete task files" on public.task_files;
create policy "members read task files" on public.task_files
  for select to authenticated
  using (public.has_signed_handbook() and public.is_space_member(public.task_space_id(task_id)));
create policy "members insert task files" on public.task_files
  for insert to authenticated
  with check (
    public.has_signed_handbook()
    and uploaded_by = auth.uid()
    and public.is_space_member(public.task_space_id(task_id))
  );
create policy "members delete task files" on public.task_files
  for delete to authenticated
  using (
    public.has_signed_handbook()
    and public.is_space_member(public.task_space_id(task_id))
    and uploaded_by = auth.uid()
  );

grant select, insert, delete on public.task_files to authenticated;

create or replace function public.task_id_from_storage_path(p_name text)
returns uuid
language plpgsql
stable
as $$
begin
  return nullif(split_part(p_name, '/', 1), '')::uuid;
exception when others then
  return null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 8388608)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "task files select" on storage.objects;
drop policy if exists "task files insert" on storage.objects;
drop policy if exists "task files delete" on storage.objects;

create policy "task files select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-files'
    and (public.has_signed_handbook() or public.is_admin())
    and public.is_space_member(public.task_space_id(public.task_id_from_storage_path(name)))
  );

create policy "task files insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-files'
    and (public.has_signed_handbook() or public.is_admin())
    and public.is_space_member(public.task_space_id(public.task_id_from_storage_path(name)))
  );

create policy "task files delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-files'
    and (public.has_signed_handbook() or public.is_admin())
    and public.is_space_member(public.task_space_id(public.task_id_from_storage_path(name)))
  );

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
alter table public.notifications replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;
