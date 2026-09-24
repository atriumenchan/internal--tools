-- Paste in the Supabase SQL editor. Safe to re-run.
-- Work-from-home requests go to Ryan. Approved days are not stored as absent.

create table if not exists public.wfh_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, work_date)
);

create index if not exists wfh_requests_status_idx on public.wfh_requests (status, work_date);
create index if not exists wfh_requests_user_idx on public.wfh_requests (user_id, work_date desc);

alter table public.wfh_requests enable row level security;

drop policy if exists "read wfh requests" on public.wfh_requests;
create policy "read wfh requests"
  on public.wfh_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

grant select on public.wfh_requests to authenticated;

create or replace function public.protect_saved_attendance()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and current_setting('app.allow_wfh', true) = 'on' then
    return NEW;
  end if;
  raise exception 'Attendance for this date is already saved and cannot be changed.';
end;
$$;

create or replace function public.stamp_wfh_on_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('absent', 'unmatched') and exists (
    select 1
    from public.wfh_requests w
    join public.employees e on e.user_id = w.user_id
    where w.status = 'approved'
      and w.work_date = new.work_date
      and (
        (new.employee_id is not null and new.employee_id = e.id)
        or (new.employee_code is not null and e.employee_code is not null and new.employee_code = e.employee_code)
      )
  ) then
    new.status := 'present';
    new.is_late := false;
    new.late_by_minutes := 0;
    new.source_note := coalesce(nullif(trim(new.source_note), ''), 'Work from home');
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_days_stamp_wfh on public.attendance_days;
create trigger attendance_days_stamp_wfh
  before insert on public.attendance_days
  for each row execute function public.stamp_wfh_on_attendance();

create or replace function public.apply_wfh_to_attendance(p_user_id uuid, p_work_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.allow_wfh', 'on', true);
  update public.attendance_days d
  set
    status = 'present',
    is_late = false,
    late_by_minutes = 0,
    source_note = coalesce(nullif(trim(d.source_note), ''), 'Work from home')
  from public.employees e
  where e.user_id = p_user_id
    and d.work_date = p_work_date
    and d.status in ('absent', 'unmatched')
    and (
      d.employee_id = e.id
      or (d.employee_code is not null and e.employee_code is not null and d.employee_code = e.employee_code)
    );
end;
$$;

create or replace function public.request_wfh(p_work_date date, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not public.has_signed_handbook() then
    raise exception 'Handbook acknowledgement required';
  end if;
  if p_work_date is null then
    raise exception 'Pick a date';
  end if;
  if p_work_date < (timezone('Asia/Kolkata', now()))::date - 1 then
    raise exception 'Pick yesterday or a later date';
  end if;
  if p_work_date > (timezone('Asia/Kolkata', now()))::date + 14 then
    raise exception 'Work from home can be asked up to 14 days ahead';
  end if;

  insert into public.wfh_requests (user_id, work_date, note, status)
  values (auth.uid(), p_work_date, nullif(trim(coalesce(p_note, '')), ''), 'pending')
  on conflict (user_id, work_date) do update
    set
      note = excluded.note,
      status = 'pending',
      decided_by = null,
      decided_at = null
    where public.wfh_requests.status = 'rejected'
  returning id into v_id;

  if v_id is null then
    raise exception 'You already have a request for that date';
  end if;

  select coalesce(nullif(trim(full_name), ''), email, 'Someone') into v_name
  from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, actor_id, type, title, body, href)
  select
    p.id,
    auth.uid(),
    'wfh',
    v_name || ' asked to work from home',
    to_char(p_work_date, 'DD Mon YYYY'),
    '/wfh'
  from public.profiles p
  where p.role = 'admin' or lower(p.email) = 'ryan@admexo.com';

  return v_id;
end;
$$;

create or replace function public.decide_wfh(p_id uuid, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_date date;
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'Only Ryan Ritabrata can approve this';
  end if;

  select user_id, work_date, status into v_user, v_date, v_status
  from public.wfh_requests
  where id = p_id;

  if v_user is null then
    raise exception 'Request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'This request was already decided';
  end if;

  update public.wfh_requests
  set
    status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(),
    decided_at = now()
  where id = p_id;

  if p_approve then
    perform public.apply_wfh_to_attendance(v_user, v_date);
  end if;

  insert into public.notifications (user_id, actor_id, type, title, body, href)
  values (
    v_user,
    auth.uid(),
    'wfh',
    case when p_approve then 'Work from home approved' else 'Work from home not approved' end,
    to_char(v_date, 'DD Mon YYYY'),
    '/wfh'
  );

  return jsonb_build_object('ok', true, 'status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;

grant execute on function public.request_wfh(date, text) to authenticated;
grant execute on function public.decide_wfh(uuid, boolean) to authenticated;
revoke all on function public.request_wfh(date, text) from public, anon;
revoke all on function public.decide_wfh(uuid, boolean) from public, anon;
revoke all on function public.apply_wfh_to_attendance(uuid, date) from public, anon;
