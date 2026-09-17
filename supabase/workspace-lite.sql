-- =============================================================================
-- ADMEXO — task review, leave, knowledge, Employee/Manager/Admin
-- Paste into Supabase → SQL Editor. Safe to re-run. Do NOT run reset.sql.
-- =============================================================================

-- Roles: keep existing admin/hr rows. Add employee + manager.
do $$ begin
  alter type public.app_role add value if not exists 'employee';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.app_role add value if not exists 'manager';
exception when duplicate_object then null; end $$;

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

-- Task workflow fields + statuses
do $$ begin
  alter type public.task_status add value if not exists 'in_review';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.task_status add value if not exists 'cancelled';
exception when duplicate_object then null; end $$;

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

-- Leave
create table if not exists public.leave_balances (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  casual_days numeric(5,1) not null default 12,
  sick_days numeric(5,1) not null default 6,
  earned_days numeric(5,1) not null default 15,
  unpaid_used numeric(5,1) not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  leave_type text not null check (leave_type in ('casual', 'sick', 'earned', 'unpaid')),
  start_date date not null,
  end_date date not null,
  days numeric(5,1) not null check (days > 0),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint leave_dates_chk check (end_date >= start_date)
);

create index if not exists leave_requests_user_idx on public.leave_requests (user_id, created_at desc);
create index if not exists leave_requests_status_idx on public.leave_requests (status);

alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;

drop policy if exists "read leave balances" on public.leave_balances;
create policy "read leave balances"
  on public.leave_balances for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

drop policy if exists "upsert own leave balance" on public.leave_balances;
create policy "insert leave balances"
  on public.leave_balances for insert to authenticated
  with check (user_id = auth.uid() or public.is_manager());

drop policy if exists "update leave balances" on public.leave_balances;
create policy "update leave balances"
  on public.leave_balances for update to authenticated
  using (user_id = auth.uid() or public.is_manager())
  with check (user_id = auth.uid() or public.is_manager());

drop policy if exists "read leave requests" on public.leave_requests;
create policy "read leave requests"
  on public.leave_requests for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

drop policy if exists "insert own leave" on public.leave_requests;
create policy "insert own leave"
  on public.leave_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "update leave requests" on public.leave_requests;
create policy "update leave requests"
  on public.leave_requests for update to authenticated
  using (public.is_manager() or user_id = auth.uid())
  with check (public.is_manager() or user_id = auth.uid());

grant select, insert, update on public.leave_balances to authenticated;
grant select, insert, update on public.leave_requests to authenticated;

create or replace function public.notify_on_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_name text;
begin
  if tg_op = 'INSERT' then
    v_name := public.actor_label(new.user_id);
    for r in
      select id from public.profiles
      where role in ('admin', 'hr', 'manager') or lower(email) = 'ryan@admexo.com'
    loop
      if r.id is distinct from new.user_id then
        perform public.push_notification(
          r.id,
          new.user_id,
          'leave_submitted',
          v_name || ' requested leave',
          new.leave_type || ' · ' || new.start_date::text || ' to ' || new.end_date::text,
          '/leave'
        );
      end if;
    end loop;
    return new;
  end if;

  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform public.push_notification(
      new.user_id,
      auth.uid(),
      'leave_decision',
      'Leave ' || new.status,
      new.leave_type || ' · ' || new.start_date::text || ' to ' || new.end_date::text,
      '/leave'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists leave_notify on public.leave_requests;
create trigger leave_notify
  after insert or update of status on public.leave_requests
  for each row execute function public.notify_on_leave();

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
