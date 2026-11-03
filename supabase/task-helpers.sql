-- Paste in the Supabase SQL editor. Safe to re-run.
-- People involved in a task (shown as Involved in the app):
--   * @mention someone in a task comment who is not the requester or assignee,
--     and they become involved in the task with their own part to finish.
--   * Involved people can open the task, comment, and attach files.
--   * Adding a file now notifies the requester, assignee, and everyone involved.
-- Includes supabase/manager-own-spaces.sql and supabase/task-comments-shared.sql.

-- -----------------------------------------------------------------------------
-- Helpers table
-- -----------------------------------------------------------------------------
create table if not exists public.task_helpers (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  comment_id uuid references public.task_comments (id) on delete set null,
  ask text,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  primary key (task_id, user_id)
);

create index if not exists task_helpers_user_idx on public.task_helpers (user_id, status);

alter table public.task_helpers enable row level security;

-- -----------------------------------------------------------------------------
-- Who can see and work on a task
-- -----------------------------------------------------------------------------
create or replace function public.is_task_helper(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.task_helpers
    where task_id = p_task_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_see_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and (
        public.is_admin()
        or public.is_space_member(t.space_id)
        or t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
        or exists (
          select 1 from public.task_helpers h
          where h.task_id = t.id and h.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.has_task_on_space(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.space_id = p_space_id
      and (
        t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
        or exists (
          select 1 from public.task_helpers h
          where h.task_id = t.id and h.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.can_add_task_files(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and (
        t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
        or exists (
          select 1 from public.task_helpers h
          where h.task_id = t.id and h.user_id = auth.uid()
        )
        or (public.is_manager() and public.can_see_task(t.id))
      )
  );
$$;

create or replace function public.can_manage_task_helpers(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and (
        t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
        or (public.is_manager() and public.can_see_task(t.id))
      )
  );
$$;

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

grant execute on function public.is_task_helper(uuid) to authenticated;
grant execute on function public.can_see_task(uuid) to authenticated;
grant execute on function public.has_task_on_space(uuid) to authenticated;
grant execute on function public.can_add_task_files(uuid) to authenticated;
grant execute on function public.can_manage_task_helpers(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Read rules
-- -----------------------------------------------------------------------------
drop policy if exists "members read spaces" on public.spaces;
create policy "members read spaces"
  on public.spaces for select to authenticated
  using (
    public.has_signed_handbook()
    and (
      public.is_admin()
      or public.is_space_member(id)
      or created_by = auth.uid()
      or public.has_task_on_space(id)
    )
  );

drop policy if exists "members read space members" on public.space_members;
create policy "members read space members"
  on public.space_members for select to authenticated
  using (
    public.has_signed_handbook()
    and (
      public.is_admin()
      or public.is_space_member(space_id)
      or exists (
        select 1 from public.spaces s
        where s.id = space_id and s.created_by = auth.uid()
      )
    )
  );

drop policy if exists "members read tasks" on public.tasks;
create policy "members read tasks"
  on public.tasks for select to authenticated
  using (
    public.has_signed_handbook()
    and (
      public.is_admin()
      or public.is_space_member(space_id)
      or created_by = auth.uid()
      or assignee_id = auth.uid()
      or public.is_task_helper(id)
    )
  );

drop policy if exists "members read task comments" on public.task_comments;
create policy "members read task comments"
  on public.task_comments for select to authenticated
  using (public.has_signed_handbook() and public.can_see_task(task_id));

drop policy if exists "members insert task comments" on public.task_comments;
create policy "members insert task comments"
  on public.task_comments for insert to authenticated
  with check (
    public.has_signed_handbook()
    and author_id = auth.uid()
    and public.can_see_task(task_id)
    and length(trim(body)) > 0
  );

drop policy if exists "read task helpers" on public.task_helpers;
create policy "read task helpers"
  on public.task_helpers for select to authenticated
  using (public.has_signed_handbook() and public.can_see_task(task_id));

drop policy if exists "remove task helpers" on public.task_helpers;
create policy "remove task helpers"
  on public.task_helpers for delete to authenticated
  using (user_id = auth.uid() or public.can_manage_task_helpers(task_id));

grant select, delete on public.task_helpers to authenticated;

-- -----------------------------------------------------------------------------
-- Files: helpers can attach, everyone on the task can open
-- -----------------------------------------------------------------------------
drop policy if exists "members read task files" on public.task_files;
create policy "members read task files"
  on public.task_files for select to authenticated
  using (public.has_signed_handbook() and public.can_see_task(task_id));

drop policy if exists "members insert task files" on public.task_files;
create policy "members insert task files"
  on public.task_files for insert to authenticated
  with check (
    public.has_signed_handbook()
    and uploaded_by = auth.uid()
    and public.can_add_task_files(task_id)
  );

drop policy if exists "members delete task files" on public.task_files;
create policy "members delete task files"
  on public.task_files for delete to authenticated
  using (
    public.has_signed_handbook()
    and public.can_see_task(task_id)
    and (
      uploaded_by = auth.uid()
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and public.can_manage_task(t.created_by)
      )
    )
  );

drop policy if exists "task files select" on storage.objects;
drop policy if exists "task files insert" on storage.objects;
drop policy if exists "task files delete" on storage.objects;

create policy "task files select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-files'
    and (public.has_signed_handbook() or public.is_admin())
    and public.can_see_task(public.task_id_from_storage_path(name))
  );

create policy "task files insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-files'
    and (public.has_signed_handbook() or public.is_admin())
    and public.can_add_task_files(public.task_id_from_storage_path(name))
  );

create policy "task files delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-files'
    and (public.has_signed_handbook() or public.is_admin())
    and public.can_see_task(public.task_id_from_storage_path(name))
  );

-- -----------------------------------------------------------------------------
-- @mentions
-- -----------------------------------------------------------------------------
create or replace function public.mentioned_profiles(p_body text, p_actor_id uuid)
returns setof uuid
language plpgsql
stable
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
    select id, full_name, email, role
    from public.profiles
    where id is distinct from p_actor_id
  loop
    if p.role = 'admin' or lower(coalesce(p.email, '')) = 'ryan@admexo.com' then
      if public.mention_hit(p_body, 'Ryan Ritabrata')
        or public.mention_hit(p_body, 'Ryan')
        or public.mention_hit(p_body, coalesce(p.full_name, '')) then
        return next p.id;
      end if;
      continue;
    end if;

    if coalesce(nullif(trim(p.full_name), ''), '') = '' then
      continue;
    end if;

    if public.mention_hit(p_body, p.full_name) then
      return next p.id;
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
      return next p.id;
    end if;
  end loop;
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
  v_user uuid;
begin
  if p_body is null or position('@' in p_body) = 0 then
    return;
  end if;

  if public.mention_hit(p_body, 'everyone') then
    for v_user in
      select id from public.profiles where id is distinct from p_actor_id
    loop
      perform public.push_notification(v_user, p_actor_id, p_type, p_title, p_body, p_href);
    end loop;
    return;
  end if;

  for v_user in select m.id from public.mentioned_profiles(p_body, p_actor_id) as m(id)
  loop
    perform public.push_notification(v_user, p_actor_id, p_type, p_title, p_body, p_href);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Comments: a mention outside the pair adds a helper; everyone on the task hears once
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_task_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tasks;
  v_name text;
  v_href text;
  v_mentioned uuid[];
  v_user uuid;
begin
  select * into t from public.tasks where id = new.task_id;
  if not found then
    return new;
  end if;
  v_name := public.actor_label(new.author_id);
  v_href := '/spaces/' || t.space_id::text || '/tasks/' || t.id::text;

  select coalesce(array_agg(m.id), '{}'::uuid[]) into v_mentioned
  from public.mentioned_profiles(new.body, new.author_id) as m(id);

  foreach v_user in array v_mentioned
  loop
    if v_user is distinct from t.created_by and v_user is distinct from t.assignee_id then
      insert into public.task_helpers (task_id, user_id, added_by, comment_id, ask)
      values (t.id, v_user, new.author_id, new.id, left(new.body, 500))
      on conflict (task_id, user_id) do update
        set added_by = excluded.added_by,
            comment_id = excluded.comment_id,
            ask = excluded.ask,
            status = 'open',
            done_at = null,
            created_at = now();
      perform public.push_notification(
        v_user,
        new.author_id,
        'task_help',
        v_name || ' involved you in ' || t.title,
        new.body,
        v_href
      );
    else
      perform public.push_notification(
        v_user,
        new.author_id,
        'mention',
        v_name || ' mentioned you on a task',
        new.body,
        v_href
      );
    end if;
  end loop;

  if public.mention_hit(new.body, 'everyone') then
    for v_user in
      select id from public.profiles
      where id is distinct from new.author_id
        and not (id = any(v_mentioned))
    loop
      perform public.push_notification(v_user, new.author_id, 'mention', v_name || ' mentioned you on a task', new.body, v_href);
    end loop;
    return new;
  end if;

  if t.assignee_id is not null and not (t.assignee_id = any(v_mentioned)) then
    perform public.push_notification(
      t.assignee_id,
      new.author_id,
      'task_comment',
      v_name || ' commented on a task assigned to you',
      new.body,
      v_href
    );
  end if;
  if t.created_by is not null
    and t.created_by is distinct from t.assignee_id
    and not (t.created_by = any(v_mentioned)) then
    perform public.push_notification(
      t.created_by,
      new.author_id,
      'task_comment',
      v_name || ' commented on a task you created',
      new.body,
      v_href
    );
  end if;
  for v_user in
    select h.user_id
    from public.task_helpers h
    where h.task_id = t.id
      and h.user_id is distinct from t.created_by
      and h.user_id is distinct from t.assignee_id
      and not (h.user_id = any(v_mentioned))
  loop
    perform public.push_notification(
      v_user,
      new.author_id,
      'task_comment',
      v_name || ' commented on a task you are involved in',
      new.body,
      v_href
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists task_comments_notify on public.task_comments;
create trigger task_comments_notify
  after insert on public.task_comments
  for each row execute function public.notify_on_task_comment();

-- -----------------------------------------------------------------------------
-- Files: tell the requester, assignee, and helpers. Several files in a row become one alert.
-- -----------------------------------------------------------------------------
create or replace function public.notify_on_task_file()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tasks;
  v_href text;
  v_title text;
  v_user uuid;
  v_recent uuid;
begin
  select * into t from public.tasks where id = new.task_id;
  if not found then
    return new;
  end if;
  v_href := '/spaces/' || t.space_id::text || '/tasks/' || t.id::text;
  v_title := public.actor_label(new.uploaded_by) || ' added a file to ' || t.title;

  for v_user in
    select distinct x.user_id
    from (
      select t.created_by as user_id
      union
      select t.assignee_id
      union
      select h.user_id from public.task_helpers h where h.task_id = t.id
    ) x
    where x.user_id is not null
      and x.user_id is distinct from new.uploaded_by
  loop
    select n.id into v_recent
    from public.notifications n
    where n.user_id = v_user
      and n.type = 'task_file'
      and n.href = v_href
      and n.actor_id is not distinct from new.uploaded_by
      and n.read_at is null
      and n.created_at > now() - interval '3 minutes'
    order by n.created_at desc
    limit 1;

    if v_recent is not null then
      update public.notifications
      set body = left(coalesce(body, '') || ', ' || new.file_name, 280)
      where id = v_recent;
    else
      perform public.push_notification(v_user, new.uploaded_by, 'task_file', v_title, new.file_name, v_href);
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists task_files_notify on public.task_files;
create trigger task_files_notify
  after insert on public.task_files
  for each row execute function public.notify_on_task_file();

-- -----------------------------------------------------------------------------
-- A helper marks their part done (or reopens it)
-- -----------------------------------------------------------------------------
create or replace function public.set_task_help_done(p_task_id uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.tasks;
  v_name text;
  v_href text;
  v_ask text;
begin
  update public.task_helpers
  set status = case when p_done then 'done' else 'open' end,
      done_at = case when p_done then now() else null end
  where task_id = p_task_id and user_id = auth.uid()
  returning ask into v_ask;
  if not found then
    raise exception 'You are not involved in this task.';
  end if;
  if not p_done then
    return;
  end if;

  select * into t from public.tasks where id = p_task_id;
  if not found then
    return;
  end if;
  v_name := public.actor_label(auth.uid());
  v_href := '/spaces/' || t.space_id::text || '/tasks/' || t.id::text;
  perform public.push_notification(t.assignee_id, auth.uid(), 'task_help', v_name || ' finished their part on ' || t.title, v_ask, v_href);
  if t.created_by is distinct from t.assignee_id then
    perform public.push_notification(t.created_by, auth.uid(), 'task_help', v_name || ' finished their part on ' || t.title, v_ask, v_href);
  end if;
end;
$$;

grant execute on function public.set_task_help_done(uuid, boolean) to authenticated;
revoke all on function public.set_task_help_done(uuid, boolean) from public, anon;

-- -----------------------------------------------------------------------------
-- Someone who becomes the requester or assignee stops being a helper
-- -----------------------------------------------------------------------------
create or replace function public.drop_helpers_who_own_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.task_helpers
  where task_id = new.id
    and (user_id = new.assignee_id or user_id = new.created_by);
  return new;
end;
$$;

drop trigger if exists tasks_drop_owner_helpers on public.tasks;
create trigger tasks_drop_owner_helpers
  after update of assignee_id, created_by on public.tasks
  for each row execute function public.drop_helpers_who_own_task();

-- -----------------------------------------------------------------------------
-- Live updates
-- -----------------------------------------------------------------------------
alter table public.task_helpers replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_helpers'
    ) then
      alter publication supabase_realtime add table public.task_helpers;
    end if;
  end if;
end $$;
