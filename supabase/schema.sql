-- =============================================================================
-- Atrium Internal Tools — Supabase schema
-- Paste this entire file into: Supabase Dashboard → SQL Editor → New query → Run
-- =============================================================================

-- Extensions
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'hr');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'intern');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.offer_status as enum (
    'draft',
    'awaiting_signature',
    'signed',
    'revoked',
    'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.day_status as enum (
    'present',
    'absent',
    'half_day',
    'leave',
    'week_off',
    'holiday',
    'unmatched'
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Updated-at helper
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles (HR / admin users who log into the tool)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role public.app_role not null default 'hr',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

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
    assigned_role := coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'hr');
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Company settings (single row)
-- -----------------------------------------------------------------------------
create table if not exists public.company_settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'Atrium',
  legal_name text not null default '',
  address text not null default '',
  city text not null default '',
  website text not null default '',
  hr_email text not null default '',
  logo_url text,
  work_start time not null default '10:00',
  work_end time not null default '19:00',
  expected_hours numeric(4,2) not null default 9,
  late_grace_minutes int not null default 15,
  half_day_hours numeric(4,2) not null default 4,
  weekly_offs int[] not null default '{0}', -- 0=Sun … 6=Sat
  offer_validity_days int not null default 7,
  offer_footer text not null default 'This offer is confidential and intended only for the named candidate.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.company_settings (id)
values (1)
on conflict (id) do nothing;

drop trigger if exists company_settings_updated_at on public.company_settings;
create trigger company_settings_updated_at
  before update on public.company_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Employees (people tracked in attendance; not necessarily login users)
-- -----------------------------------------------------------------------------
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

create index if not exists employees_name_idx on public.employees (lower(full_name));

drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Holidays
-- -----------------------------------------------------------------------------
create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Offer letters
-- -----------------------------------------------------------------------------
create table if not exists public.offer_letters (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  candidate_name text not null,
  candidate_email text not null,
  candidate_phone text,
  "position" text not null,
  department text,
  employment_type public.employment_type not null default 'full_time',
  location text,
  ctc_annual numeric(14,2),
  ctc_currency text not null default 'INR',
  joining_date date,
  reporting_manager text,
  probation_months int not null default 3,
  notice_period_days int not null default 30,
  custom_body text,
  benefits text,
  status public.offer_status not null default 'draft',
  signing_token uuid unique default gen_random_uuid(),
  token_expires_at timestamptz,
  sent_for_signature_at timestamptz,
  signed_at timestamptz,
  signer_name text,
  signature_data text,
  signer_ip text,
  signer_user_agent text,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists offer_letters_status_idx on public.offer_letters (status);
create index if not exists offer_letters_token_idx on public.offer_letters (signing_token);

drop trigger if exists offer_letters_updated_at on public.offer_letters;
create trigger offer_letters_updated_at
  before update on public.offer_letters
  for each row execute function public.set_updated_at();

create table if not exists public.offer_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offer_letters (id) on delete cascade,
  event_type text not null,
  note text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Attendance
-- -----------------------------------------------------------------------------
create table if not exists public.attendance_uploads (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references public.profiles (id) on delete set null,
  file_name text not null,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  row_count int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references public.attendance_uploads (id) on delete set null,
  employee_id uuid references public.employees (id) on delete set null,
  employee_code text,
  employee_name text not null,
  work_date date not null,
  punch_in timestamptz,
  punch_out timestamptz,
  hours_worked numeric(6,2) not null default 0,
  is_late boolean not null default false,
  late_by_minutes int not null default 0,
  status public.day_status not null default 'unmatched',
  source_note text,
  created_at timestamptz not null default now()
);

-- unique index that treats null employee_code as empty
drop index if exists attendance_days_person_date_uidx;
create unique index attendance_days_person_date_uidx
  on public.attendance_days (lower(employee_name), work_date, coalesce(employee_code, ''));

create index if not exists attendance_days_date_idx on public.attendance_days (work_date);
create index if not exists attendance_days_employee_idx on public.attendance_days (employee_id);

create table if not exists public.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees (id) on delete cascade,
  employee_code text,
  employee_name text not null,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  working_days int not null default 0,
  present_days numeric(5,2) not null default 0,
  absent_days numeric(5,2) not null default 0,
  leave_days numeric(5,2) not null default 0,
  half_days int not null default 0,
  week_offs int not null default 0,
  holidays int not null default 0,
  late_days int not null default 0,
  total_hours numeric(8,2) not null default 0,
  overtime_hours numeric(8,2) not null default 0,
  updated_at timestamptz not null default now()
);

drop index if exists monthly_summaries_person_period_uidx;
create unique index monthly_summaries_person_period_uidx
  on public.monthly_summaries (lower(employee_name), period_month, period_year, coalesce(employee_code, ''));

-- -----------------------------------------------------------------------------
-- Public signing RPCs (candidate has no login — uses anon key + token)
-- -----------------------------------------------------------------------------
create or replace function public.get_offer_for_signing(p_token uuid)
returns table (
  id uuid,
  candidate_name text,
  candidate_email text,
  "position" text,
  department text,
  employment_type public.employment_type,
  location text,
  ctc_annual numeric,
  ctc_currency text,
  joining_date date,
  reporting_manager text,
  probation_months int,
  notice_period_days int,
  custom_body text,
  benefits text,
  status public.offer_status,
  token_expires_at timestamptz,
  signed_at timestamptz,
  signer_name text,
  signature_data text,
  company_name text,
  legal_name text,
  address text,
  city text,
  website text,
  offer_footer text
)
language sql
security definer
set search_path = public
as $$
  select
    o.id,
    o.candidate_name,
    o.candidate_email,
    o."position",
    o.department,
    o.employment_type,
    o.location,
    o.ctc_annual,
    o.ctc_currency,
    o.joining_date,
    o.reporting_manager,
    o.probation_months,
    o.notice_period_days,
    o.custom_body,
    o.benefits,
    o.status,
    o.token_expires_at,
    o.signed_at,
    o.signer_name,
    o.signature_data,
    s.company_name,
    s.legal_name,
    s.address,
    s.city,
    s.website,
    s.offer_footer
  from public.offer_letters o
  cross join public.company_settings s
  where o.signing_token = p_token
    and o.status in ('awaiting_signature', 'signed')
    and (o.token_expires_at is null or o.token_expires_at > now() or o.status = 'signed')
  limit 1;
$$;

create or replace function public.sign_offer(
  p_token uuid,
  p_signer_name text,
  p_signature_data text,
  p_ip text default null,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  offer public.offer_letters;
begin
  if p_signer_name is null or length(trim(p_signer_name)) < 2 then
    raise exception 'Signer name is required';
  end if;
  if p_signature_data is null or length(p_signature_data) < 40 then
    raise exception 'Signature is required';
  end if;

  select * into offer
  from public.offer_letters
  where signing_token = p_token
  for update;

  if not found then
    raise exception 'Offer not found';
  end if;

  if offer.status = 'signed' then
    return jsonb_build_object('ok', true, 'already_signed', true, 'id', offer.id);
  end if;

  if offer.status <> 'awaiting_signature' then
    raise exception 'This offer is not open for signature';
  end if;

  if offer.token_expires_at is not null and offer.token_expires_at < now() then
    update public.offer_letters set status = 'expired' where id = offer.id;
    raise exception 'This signing link has expired';
  end if;

  update public.offer_letters
  set
    status = 'signed',
    signed_at = now(),
    finalized_at = now(),
    signer_name = trim(p_signer_name),
    signature_data = p_signature_data,
    signer_ip = p_ip,
    signer_user_agent = p_user_agent
  where id = offer.id;

  insert into public.offer_events (offer_id, event_type, note)
  values (offer.id, 'signed', 'Candidate signed. Offer is now finalized and sent.');

  return jsonb_build_object('ok', true, 'already_signed', false, 'id', offer.id);
end;
$$;

grant execute on function public.get_offer_for_signing(uuid) to anon, authenticated;
grant execute on function public.sign_offer(uuid, text, text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.company_settings enable row level security;
alter table public.employees enable row level security;
alter table public.holidays enable row level security;
alter table public.offer_letters enable row level security;
alter table public.offer_events enable row level security;
alter table public.attendance_uploads enable row level security;
alter table public.attendance_days enable row level security;
alter table public.monthly_summaries enable row level security;

-- Helper: current user is staff (any logged-in profile)
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Drop existing policies if re-running
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles','company_settings','employees','holidays',
        'offer_letters','offer_events','attendance_uploads',
        'attendance_days','monthly_summaries'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- profiles
create policy "staff read profiles" on public.profiles
  for select to authenticated using (public.is_staff());
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid());
create policy "admin update any profile" on public.profiles
  for update to authenticated using (public.is_admin());

-- company_settings
create policy "staff read settings" on public.company_settings
  for select to authenticated using (public.is_staff());
create policy "staff update settings" on public.company_settings
  for update to authenticated using (public.is_staff());
create policy "anon read settings via rpc only" on public.company_settings
  for select to anon using (false);

-- employees
create policy "staff read employees" on public.employees
  for select to authenticated using (public.is_staff());
create policy "staff write employees" on public.employees
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- holidays
create policy "staff read holidays" on public.holidays
  for select to authenticated using (public.is_staff());
create policy "staff write holidays" on public.holidays
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- offer_letters: staff full access (candidates use RPCs, not direct table)
create policy "staff read offers" on public.offer_letters
  for select to authenticated using (public.is_staff());
create policy "staff insert offers" on public.offer_letters
  for insert to authenticated with check (public.is_staff());
create policy "staff update offers" on public.offer_letters
  for update to authenticated using (public.is_staff());
create policy "staff delete offers" on public.offer_letters
  for delete to authenticated using (public.is_staff());

create policy "staff read offer events" on public.offer_events
  for select to authenticated using (public.is_staff());
create policy "staff insert offer events" on public.offer_events
  for insert to authenticated with check (public.is_staff());

-- attendance
create policy "staff read uploads" on public.attendance_uploads
  for select to authenticated using (public.is_staff());
create policy "staff write uploads" on public.attendance_uploads
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "staff read days" on public.attendance_days
  for select to authenticated using (public.is_staff());
create policy "staff write days" on public.attendance_days
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "staff read summaries" on public.monthly_summaries
  for select to authenticated using (public.is_staff());
create policy "staff write summaries" on public.monthly_summaries
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
