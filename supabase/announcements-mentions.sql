-- =============================================================================
-- Company announcements + @mention notifications
-- Paste this whole file into SQL Editor and run it (do NOT run reset.sql).
-- =============================================================================

create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or not exists (
      select 1 from public.employees e where e.user_id = auth.uid()
    );
$$;

grant execute on function public.is_operator() to authenticated;

-- -----------------------------------------------------------------------------
-- Announcements
-- -----------------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  pinned boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists announcements_created_idx
  on public.announcements (pinned desc, created_at desc);

alter table public.announcements enable row level security;

drop policy if exists "staff read announcements" on public.announcements;
drop policy if exists "operators write announcements" on public.announcements;
create policy "staff read announcements" on public.announcements
  for select to authenticated
  using (public.has_signed_handbook() or public.is_admin());
create policy "operators write announcements" on public.announcements
  for all to authenticated
  using (public.is_operator())
  with check (public.is_operator());

grant select, insert, update, delete on public.announcements to authenticated;

create or replace function public.notify_on_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from public.profiles where id is distinct from new.created_by
  loop
    perform public.push_notification(
      r.id,
      new.created_by,
      'announcement',
      'Company announcement: ' || left(new.title, 80),
      new.body,
      '/home'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists announcements_notify on public.announcements;
create trigger announcements_notify
  after insert on public.announcements
  for each row execute function public.notify_on_announcement();

-- -----------------------------------------------------------------------------
-- @mentions in comments and chat
-- -----------------------------------------------------------------------------
create or replace function public.mention_hit(p_body text, p_name text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_hay text := lower(coalesce(p_body, ''));
  v_name text := lower(trim(coalesce(p_name, '')));
  v_needle text;
  v_idx int;
  v_before text;
  v_after text;
begin
  if v_name = '' then
    return false;
  end if;
  v_needle := '@' || v_name;
  v_idx := position(v_needle in v_hay);
  if v_idx = 0 then
    return false;
  end if;
  if v_idx > 1 then
    v_before := substr(v_hay, v_idx - 1, 1);
    if v_before ~ '[[:alnum:]]' then
      return false;
    end if;
  end if;
  if v_idx + length(v_needle) - 1 < length(v_hay) then
    v_after := substr(v_hay, v_idx + length(v_needle), 1);
    if v_after ~ '[[:alnum:]]' then
      return false;
    end if;
  end if;
  return true;
end;
$$;

create or replace function public.notify_mentions(
  p_actor_id uuid,
  p_body text,
  p_type text,
  p_title text,
  p_href text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v_first text;
  v_first_count int;
begin
  if p_body is null or position('@' in p_body) = 0 then
    return;
  end if;

  for p in
    select id, full_name
    from public.profiles
    where id is distinct from p_actor_id
      and coalesce(nullif(trim(full_name), ''), '') <> ''
  loop
    if public.mention_hit(p_body, p.full_name) then
      perform public.push_notification(p.id, p_actor_id, p_type, p_title, p_body, p_href);
      continue;
    end if;

    v_first := split_part(trim(p.full_name), ' ', 1);
    if length(v_first) < 2 then
      continue;
    end if;
    select count(*) into v_first_count
    from public.profiles
    where lower(split_part(trim(full_name), ' ', 1)) = lower(v_first);
    if v_first_count = 1 and public.mention_hit(p_body, v_first) then
      perform public.push_notification(p.id, p_actor_id, p_type, p_title, p_body, p_href);
    end if;
  end loop;
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
  perform public.notify_mentions(
    new.author_id,
    new.body,
    'mention',
    v_name || ' mentioned you in chat',
    '/chat?c=' || new.conversation_id::text
  );
  return new;
end;
$$;

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
  perform public.notify_mentions(
    new.author_id,
    new.body,
    'mention',
    v_name || ' mentioned you on a task',
    '/spaces/' || t.space_id::text || '/tasks/' || t.id::text
  );
  return new;
end;
$$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.notify_on_message();

drop trigger if exists task_comments_notify on public.task_comments;
create trigger task_comments_notify
  after insert on public.task_comments
  for each row execute function public.notify_on_task_comment();
