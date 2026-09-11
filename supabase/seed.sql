-- Creates public.employees if it is missing, then seeds the team.
-- Paste this whole file into SQL Editor and run it.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name text not null,
  email text,
  department text,
  designation text,
  joining_date date,
  user_id uuid unique references auth.users (id) on delete set null,
  ignored boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employees add column if not exists user_id uuid unique references auth.users (id) on delete set null;
alter table public.employees add column if not exists ignored boolean not null default false;

create index if not exists employees_name_idx on public.employees (lower(full_name));

drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

alter table public.employees enable row level security;

drop policy if exists "staff read employees" on public.employees;
drop policy if exists "staff write employees" on public.employees;
drop policy if exists "authenticated read employees" on public.employees;
drop policy if exists "authenticated write employees" on public.employees;

create policy "authenticated read employees" on public.employees
  for select to authenticated using (true);
create policy "authenticated write employees" on public.employees
  for all to authenticated using (true) with check (true);

insert into public.employees (employee_code, full_name, department, ignored, is_active)
values
  ('0001', 'Yogesh Mishra', 'Operations', false, true),
  ('0002', 'Gaurav Mishra', 'Tech & Development', false, true),
  ('0004', 'Kartik Dhyani', 'CPA Affiliate', false, true),
  ('0005', 'Ankur Maurya', 'Tech & Development', false, true),
  ('0006', 'Mudit Panwar', 'CPA Affiliate', false, true),
  ('0007', 'Sneha Chadda', 'CPA Affiliate', false, true),
  ('0008', 'Mudit Chauhan', 'CPL Affiliate', false, true),
  ('0010', 'Ashok Rawat', 'CPA Affiliate', false, true)
on conflict (employee_code) do update
set
  full_name = excluded.full_name,
  department = excluded.department,
  ignored = excluded.ignored,
  is_active = true;

insert into public.employees (employee_code, full_name, department, ignored, is_active)
values ('0003', 'Ryan Ray', 'Operations', true, false)
on conflict (employee_code) do update
set ignored = true, is_active = false;

update public.company_settings
set weekly_offs = '{0,6}'
where id = 1;

insert into public.holidays (holiday_date, name)
values
  ('2026-01-26', 'Republic Day'),
  ('2026-03-04', 'Holi'),
  ('2026-03-26', 'Ram Navami'),
  ('2026-08-15', 'Independence Day'),
  ('2026-08-28', 'Raksha Bandhan'),
  ('2026-09-04', 'Janmashtami'),
  ('2026-10-02', 'Gandhi Jayanti'),
  ('2026-10-20', 'Dussehra'),
  ('2026-11-08', 'Diwali'),
  ('2026-12-25', 'Christmas')
on conflict (holiday_date) do update
set name = excluded.name;
