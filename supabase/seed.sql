-- Run after schema.sql on an existing project.
alter table public.employees add column if not exists user_id uuid unique references auth.users (id) on delete set null;
alter table public.employees add column if not exists ignored boolean not null default false;

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

-- Ryan Ray is never a staff user and is dropped from attendance.
insert into public.employees (employee_code, full_name, department, ignored, is_active)
values ('0003', 'Ryan Ray', 'Operations', true, false)
on conflict (employee_code) do update
set ignored = true, is_active = false;
