-- =============================================================================
-- ADMEXO Internal Tools — FULL RESET
-- Paste this entire file into: Supabase Dashboard → SQL Editor → New query → Run
--
-- Wipes ALL app data in public (attendance, offers, spaces, chat, settings).
-- Does NOT delete login accounts in Authentication. Those are re-linked.
-- After this runs, everyone must sign the handbook once on next login.
-- =============================================================================

create extension if not exists "pgcrypto";

-- Drop app objects. Keep auth.users so people can still sign in.
drop trigger if exists on_auth_user_created on auth.users;
drop schema if exists public cascade;
create schema public;
alter schema public owner to postgres;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant create on schema public to postgres, service_role;
grant all on schema public to postgres, service_role;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'hr');
create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'intern');
create type public.offer_status as enum (
  'draft',
  'awaiting_signature',
  'signed',
  'revoked',
  'expired'
);
create type public.day_status as enum (
  'present',
  'absent',
  'half_day',
  'leave',
  'week_off',
  'holiday',
  'unmatched'
);
create type public.task_status as enum ('open', 'in_progress', 'done');
create type public.conversation_type as enum ('dm', 'group', 'space');

-- -----------------------------------------------------------------------------
-- Helpers
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
-- Profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role public.app_role not null default 'hr',
  handbook_version text,
  handbook_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  if (select count(*) from public.profiles) = 0
     or lower(coalesce(new.email, '')) = 'ryan@admexo.com' then
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Company settings
-- -----------------------------------------------------------------------------
create table public.company_settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'ADMEXO',
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
  weekly_offs int[] not null default '{0,6}',
  offer_validity_days int not null default 7,
  offer_footer text not null default 'This offer is confidential and intended only for the named candidate.',
  handbook_version text not null default '2.0',
  anyone_can_create_spaces boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.company_settings (id, company_name, handbook_version, anyone_can_create_spaces, weekly_offs)
values (1, 'ADMEXO', '2.0', true, '{0,6}');

create trigger company_settings_updated_at
  before update on public.company_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Employees
-- -----------------------------------------------------------------------------
create table public.employees (
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

create index employees_name_idx on public.employees (lower(full_name));

create trigger employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Holidays
-- -----------------------------------------------------------------------------
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Offer letters
-- -----------------------------------------------------------------------------
create table public.offer_letters (
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

create index offer_letters_status_idx on public.offer_letters (status);
create index offer_letters_token_idx on public.offer_letters (signing_token);

create trigger offer_letters_updated_at
  before update on public.offer_letters
  for each row execute function public.set_updated_at();

create table public.offer_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offer_letters (id) on delete cascade,
  event_type text not null,
  note text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Attendance
-- -----------------------------------------------------------------------------
create table public.attendance_uploads (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references public.profiles (id) on delete set null,
  file_name text not null,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null,
  row_count int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table public.attendance_days (
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

create unique index attendance_days_person_date_uidx
  on public.attendance_days (lower(employee_name), work_date, coalesce(employee_code, ''));
create index attendance_days_date_idx on public.attendance_days (work_date);
create index attendance_days_employee_idx on public.attendance_days (employee_id);

create table public.monthly_summaries (
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

create unique index monthly_summaries_person_period_uidx
  on public.monthly_summaries (lower(employee_name), period_month, period_year, coalesce(employee_code, ''));

-- -----------------------------------------------------------------------------
-- Handbook acknowledgements, Spaces, Chat
-- -----------------------------------------------------------------------------
create table public.handbook_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  version text not null,
  signer_name text not null,
  signature_data text not null,
  ip text,
  created_at timestamptz not null default now()
);

create index handbook_acknowledgements_user_idx
  on public.handbook_acknowledgements (user_id, created_at desc);

create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index space_members_user_idx on public.space_members (user_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces (id) on delete cascade,
  title text not null,
  description text,
  status public.task_status not null default 'open',
  assignee_id uuid references public.profiles (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  due_date date,
  priority text not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tasks_space_idx on public.tasks (space_id, created_at desc);

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type public.conversation_type not null,
  space_id uuid references public.spaces (id) on delete cascade,
  name text,
  created_at timestamptz not null default now(),
  constraint conversations_space_type_chk check (
    (type = 'space' and space_id is not null) or
    (type <> 'space' and space_id is null)
  )
);

create unique index conversations_space_uidx
  on public.conversations (space_id)
  where type = 'space';

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx
  on public.messages (conversation_id, created_at);

alter table public.messages replica identity full;
alter table public.task_comments replica identity full;

-- -----------------------------------------------------------------------------
-- Auth helpers
-- -----------------------------------------------------------------------------
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
    where id = auth.uid()
      and (role = 'admin' or lower(email) = 'ryan@admexo.com')
  );
$$;

create or replace function public.has_signed_handbook()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.profiles p
      cross join public.company_settings s
      where p.id = auth.uid()
        and s.id = 1
        and p.handbook_version is not null
        and p.handbook_version = s.handbook_version
    );
$$;

create or replace function public.can_create_spaces()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_signed_handbook()
    and (
      public.is_admin()
      or exists (
        select 1 from public.company_settings
        where id = 1 and anyone_can_create_spaces
      )
    );
$$;

create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_space_member_user(p_space_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = p_user_id
  );
$$;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  );
$$;

create or replace function public.task_space_id(p_task_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select space_id from public.tasks where id = p_task_id;
$$;

create or replace function public.protect_handbook_fields()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and (
       new.handbook_version is distinct from old.handbook_version
       or new.handbook_acknowledged_at is distinct from old.handbook_acknowledged_at
     )
     and current_setting('app.ack_handbook', true) is distinct from '1'
  then
    raise exception 'handbook acknowledgement must go through acknowledge_handbook()';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_handbook
  before update on public.profiles
  for each row execute function public.protect_handbook_fields();

create or replace function public.add_profile_to_default_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id uuid;
  v_conv_id uuid;
begin
  select id into v_space_id from public.spaces where lower(name) = 'admexo' order by created_at limit 1;
  if v_space_id is null then
    return new;
  end if;
  insert into public.space_members (space_id, user_id)
  values (v_space_id, new.id)
  on conflict do nothing;
  select id into v_conv_id from public.conversations
  where type = 'space' and space_id = v_space_id
  limit 1;
  if v_conv_id is not null then
    insert into public.conversation_members (conversation_id, user_id)
    values (v_conv_id, new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger profiles_default_space
  after insert on public.profiles
  for each row execute function public.add_profile_to_default_space();

-- -----------------------------------------------------------------------------
-- Offer signing RPCs
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

-- -----------------------------------------------------------------------------
-- Spaces / Chat / handbook RPCs
-- -----------------------------------------------------------------------------
create or replace function public.acknowledge_handbook(
  p_signer_name text,
  p_signature_data text,
  p_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_signer_name is null or length(trim(p_signer_name)) < 2 then
    raise exception 'Name is required';
  end if;
  if p_signature_data is null or length(p_signature_data) < 40 then
    raise exception 'Signature is required';
  end if;

  select handbook_version into v_version from public.company_settings where id = 1;
  if v_version is null or length(trim(v_version)) = 0 then
    v_version := '2.0';
  end if;

  insert into public.handbook_acknowledgements (user_id, version, signer_name, signature_data, ip)
  values (auth.uid(), v_version, trim(p_signer_name), p_signature_data, p_ip);

  perform set_config('app.ack_handbook', '1', true);

  update public.profiles
  set handbook_version = v_version,
      handbook_acknowledged_at = now()
  where id = auth.uid();

  return jsonb_build_object('ok', true, 'version', v_version);
end;
$$;

create or replace function public.create_space(p_name text, p_color text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_conv uuid;
begin
  if not public.can_create_spaces() then
    raise exception 'You cannot create a Space';
  end if;
  if p_name is null or length(trim(p_name)) < 1 then
    raise exception 'Name is required';
  end if;

  insert into public.spaces (name, color, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_color, '')), ''), auth.uid())
  returning id into v_id;

  insert into public.space_members (space_id, user_id)
  values (v_id, auth.uid());

  insert into public.conversations (type, space_id, name)
  values ('space', v_id, trim(p_name))
  returning id into v_conv;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv, auth.uid());

  return v_id;
end;
$$;

create or replace function public.add_space_member(p_space_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv uuid;
begin
  if not public.has_signed_handbook() then
    raise exception 'Handbook acknowledgement required';
  end if;
  if not public.is_space_member(p_space_id) then
    raise exception 'Not a member of this Space';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Person not found';
  end if;

  insert into public.space_members (space_id, user_id)
  values (p_space_id, p_user_id)
  on conflict do nothing;

  select id into v_conv from public.conversations
  where type = 'space' and space_id = p_space_id
  limit 1;
  if v_conv is not null then
    insert into public.conversation_members (conversation_id, user_id)
    values (v_conv, p_user_id)
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.get_or_create_dm(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not public.has_signed_handbook() then
    raise exception 'Handbook acknowledgement required';
  end if;
  if p_other_user_id is null or p_other_user_id = auth.uid() then
    raise exception 'Pick someone else';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'Person not found';
  end if;

  select c.id into v_id
  from public.conversations c
  where c.type = 'dm'
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = auth.uid()
    )
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = p_other_user_id
    )
    and (
      select count(*) from public.conversation_members m
      where m.conversation_id = c.id
    ) = 2
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.conversations (type, name)
  values ('dm', null)
  returning id into v_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_id, auth.uid()), (v_id, p_other_user_id);

  return v_id;
end;
$$;

create or replace function public.create_group_conversation(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid;
begin
  if not public.has_signed_handbook() then
    raise exception 'Handbook acknowledgement required';
  end if;
  if p_name is null or length(trim(p_name)) < 1 then
    raise exception 'Group name is required';
  end if;

  insert into public.conversations (type, name)
  values ('group', trim(p_name))
  returning id into v_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_id, auth.uid())
  on conflict do nothing;

  if p_member_ids is not null then
    foreach v_uid in array p_member_ids
    loop
      if v_uid is not null and exists (select 1 from public.profiles where id = v_uid) then
        insert into public.conversation_members (conversation_id, user_id)
        values (v_id, v_uid)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  return v_id;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'Not a member of this conversation';
  end if;
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.chat_unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.conversation_members cm
  where cm.user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.conversation_id = cm.conversation_id
        and m.author_id <> auth.uid()
        and m.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz)
    );
$$;

-- -----------------------------------------------------------------------------
-- RLS
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
alter table public.handbook_acknowledgements enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "staff read profiles" on public.profiles
  for select to authenticated using (public.is_staff());
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid());
create policy "admin update any profile" on public.profiles
  for update to authenticated using (public.is_admin());

create policy "staff read settings" on public.company_settings
  for select to authenticated using (public.is_staff());
create policy "staff update settings" on public.company_settings
  for update to authenticated using (public.is_staff());
create policy "anon read settings via rpc only" on public.company_settings
  for select to anon using (false);

create policy "staff read employees" on public.employees
  for select to authenticated using (public.is_staff());
create policy "staff write employees" on public.employees
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "staff read holidays" on public.holidays
  for select to authenticated using (public.is_staff());
create policy "staff write holidays" on public.holidays
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

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

create policy "own handbook acknowledgements"
  on public.handbook_acknowledgements for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "members read spaces"
  on public.spaces for select to authenticated
  using (public.has_signed_handbook() and public.is_space_member(id));

create policy "members read space members"
  on public.space_members for select to authenticated
  using (public.has_signed_handbook() and public.is_space_member(space_id));

create policy "members read tasks"
  on public.tasks for select to authenticated
  using (public.has_signed_handbook() and public.is_space_member(space_id));

create policy "members insert tasks"
  on public.tasks for insert to authenticated
  with check (
    public.has_signed_handbook()
    and public.is_space_member(space_id)
    and created_by = auth.uid()
    and (assignee_id is null or public.is_space_member_user(space_id, assignee_id))
  );

create policy "members update tasks"
  on public.tasks for update to authenticated
  using (public.has_signed_handbook() and public.is_space_member(space_id))
  with check (
    public.has_signed_handbook()
    and public.is_space_member(space_id)
    and (assignee_id is null or public.is_space_member_user(space_id, assignee_id))
  );

create policy "members delete tasks"
  on public.tasks for delete to authenticated
  using (public.has_signed_handbook() and public.is_space_member(space_id));

create policy "members delete spaces"
  on public.spaces for delete to authenticated
  using (public.has_signed_handbook() and public.is_space_member(id));

create policy "members read task comments"
  on public.task_comments for select to authenticated
  using (
    public.has_signed_handbook()
    and public.is_space_member(public.task_space_id(task_id))
  );

create policy "members insert task comments"
  on public.task_comments for insert to authenticated
  with check (
    public.has_signed_handbook()
    and author_id = auth.uid()
    and public.is_space_member(public.task_space_id(task_id))
    and length(trim(body)) > 0
  );

create policy "authors delete task comments"
  on public.task_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy "members read conversations"
  on public.conversations for select to authenticated
  using (public.has_signed_handbook() and public.is_conversation_member(id));

create policy "members read conversation members"
  on public.conversation_members for select to authenticated
  using (public.has_signed_handbook() and public.is_conversation_member(conversation_id));

create policy "members update own last read"
  on public.conversation_members for update to authenticated
  using (user_id = auth.uid() and public.is_conversation_member(conversation_id))
  with check (user_id = auth.uid());

create policy "members read messages"
  on public.messages for select to authenticated
  using (public.has_signed_handbook() and public.is_conversation_member(conversation_id));

create policy "members insert messages"
  on public.messages for insert to authenticated
  with check (
    public.has_signed_handbook()
    and author_id = auth.uid()
    and public.is_conversation_member(conversation_id)
    and length(trim(body)) > 0
  );

create policy "authors delete messages"
  on public.messages for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy "members delete conversations"
  on public.conversations for delete to authenticated
  using (public.has_signed_handbook() and public.is_conversation_member(id) and type <> 'space');

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;

grant execute on function public.get_offer_for_signing(uuid) to anon, authenticated;
grant execute on function public.sign_offer(uuid, text, text, text, text) to anon, authenticated;

revoke all on function public.acknowledge_handbook(text, text, text) from public, anon;
revoke all on function public.create_space(text, text) from public, anon;
revoke all on function public.add_space_member(uuid, uuid) from public, anon;
revoke all on function public.get_or_create_dm(uuid) from public, anon;
revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.chat_unread_count() from public, anon;

grant execute on function public.acknowledge_handbook(text, text, text) to authenticated;
grant execute on function public.create_space(text, text) to authenticated;
grant execute on function public.add_space_member(uuid, uuid) to authenticated;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.chat_unread_count() to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_comments'
    ) then
      alter publication supabase_realtime add table public.task_comments;
    end if;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Re-link existing logins, then seed
-- -----------------------------------------------------------------------------
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  coalesce(u.email, u.id::text),
  coalesce(u.raw_user_meta_data->>'full_name', split_part(coalesce(u.email, ''), '@', 1), 'user'),
  case
    when lower(coalesce(u.email, '')) = 'ryan@admexo.com' then 'admin'::public.app_role
    else coalesce((u.raw_user_meta_data->>'role')::public.app_role, 'hr')
  end
from auth.users u
on conflict (id) do update
set email = excluded.email,
    full_name = excluded.full_name;

update public.profiles
set role = 'admin'
where not exists (select 1 from public.profiles where role = 'admin')
  and id = (select id from public.profiles order by created_at limit 1);

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

do $$
declare
  v_space_id uuid;
  v_conv_id uuid;
  v_creator uuid;
begin
  select id into v_creator from public.profiles order by created_at asc limit 1;
  if v_creator is null then
    return;
  end if;

  insert into public.spaces (name, color, created_by)
  values ('ADMEXO', '#FF5A1F', v_creator)
  returning id into v_space_id;

  insert into public.space_members (space_id, user_id)
  select v_space_id, p.id from public.profiles p
  on conflict do nothing;

  insert into public.conversations (type, space_id, name)
  values ('space', v_space_id, 'ADMEXO')
  returning id into v_conv_id;

  insert into public.conversation_members (conversation_id, user_id)
  select v_conv_id, sm.user_id
  from public.space_members sm
  where sm.space_id = v_space_id
  on conflict do nothing;
end $$;
