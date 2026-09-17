-- =============================================================================
-- STEP 2 of 2 — run AFTER workspace-lite-enums.sql has succeeded on its own.
-- Postgres cannot add enum values and use them in the same run.
-- Safe to re-run. Do NOT run reset.sql.
-- =============================================================================

alter table public.profiles alter column role set default 'employee';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_role public.app_role;
begin
  if (select count(*) from public.profiles) = 0 then
    assigned_role := 'admin';
  else
    assigned_role := coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'employee');
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    assigned_role
  );
  return new;
end;
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (
        role in ('admin', 'hr', 'manager')
        or lower(email) = 'ryan@admexo.com'
      )
  );
$$;

grant execute on function public.is_manager() to authenticated;

alter table public.tasks
  add column if not exists completion_criteria text,
  add column if not exists reviewer_id uuid references public.profiles (id) on delete set null;

create index if not exists tasks_reviewer_idx on public.tasks (reviewer_id);

create or replace function public.enforce_task_done()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    if new.assignee_id is not null and new.created_by is distinct from new.assignee_id then
      if auth.uid() is distinct from coalesce(new.reviewer_id, new.created_by) then
        raise exception 'This task needs reviewer approval before it can be marked done.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_enforce_done on public.tasks;
create trigger tasks_enforce_done
  before update of status on public.tasks
  for each row execute function public.enforce_task_done();

create or replace function public.notify_on_task_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_href text;
  v_reviewer uuid;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  v_name := public.actor_label(auth.uid());
  v_href := '/spaces/' || new.space_id::text || '/tasks/' || new.id::text;
  v_reviewer := coalesce(new.reviewer_id, new.created_by);

  if new.status = 'in_review' and v_reviewer is not null then
    perform public.push_notification(
      v_reviewer,
      auth.uid(),
      'task_submitted',
      v_name || ' submitted work for review',
      new.title,
      v_href
    );
  end if;

  if old.status = 'in_review' and new.status = 'done' and new.assignee_id is not null then
    perform public.push_notification(
      new.assignee_id,
      auth.uid(),
      'task_reviewed',
      v_name || ' approved your work',
      new.title,
      v_href
    );
  end if;

  if old.status = 'in_review' and new.status = 'in_progress' and new.assignee_id is not null then
    perform public.push_notification(
      new.assignee_id,
      auth.uid(),
      'task_reviewed',
      v_name || ' asked for changes',
      new.title,
      v_href
    );
  end if;

  return new;
end;
$$;

drop trigger if exists tasks_status_notify on public.tasks;
create trigger tasks_status_notify
  after update of status on public.tasks
  for each row execute function public.notify_on_task_status();

drop trigger if exists leave_notify on public.leave_requests;
drop function if exists public.notify_on_leave();
drop table if exists public.leave_requests;
drop table if exists public.leave_balances;

-- Knowledge articles
create table if not exists public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'guide',
  body text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_articles_updated_idx
  on public.knowledge_articles (updated_at desc);

drop trigger if exists knowledge_articles_updated_at on public.knowledge_articles;
create trigger knowledge_articles_updated_at
  before update on public.knowledge_articles
  for each row execute function public.set_updated_at();

alter table public.knowledge_articles enable row level security;

drop policy if exists "read knowledge" on public.knowledge_articles;
create policy "read knowledge"
  on public.knowledge_articles for select to authenticated
  using (public.has_signed_handbook() or public.is_admin());

drop policy if exists "write knowledge" on public.knowledge_articles;
create policy "write knowledge"
  on public.knowledge_articles for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

grant select, insert, update, delete on public.knowledge_articles to authenticated;
