-- =============================================================================
-- ADMEXO Spaces, Chat, and handbook acknowledgements
-- Paste this entire file into: Supabase Dashboard → SQL Editor → New query → Run
-- Run AFTER supabase/schema.sql. Does not rewrite attendance / offers.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Columns on existing tables
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists handbook_version text,
  add column if not exists handbook_acknowledged_at timestamptz;

alter table public.company_settings
  add column if not exists handbook_version text not null default '2.0',
  add column if not exists anyone_can_create_spaces boolean not null default true;

update public.company_settings
set company_name = 'ADMEXO'
where id = 1 and company_name in ('Atrium', '');

update public.company_settings
set handbook_version = '2.0'
where id = 1 and (handbook_version is null or handbook_version = '');

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.task_status as enum ('open', 'in_progress', 'done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.conversation_type as enum ('dm', 'group', 'space');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table if not exists public.handbook_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  version text not null,
  signer_name text not null,
  signature_data text not null,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists handbook_acknowledgements_user_idx
  on public.handbook_acknowledgements (user_id, created_at desc);

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index if not exists space_members_user_idx on public.space_members (user_id);

create table if not exists public.tasks (
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

create index if not exists tasks_space_idx on public.tasks (space_id, created_at desc);

alter table public.tasks add column if not exists priority text not null default 'medium';
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks
  add constraint tasks_priority_check
  check (priority in ('low', 'medium', 'high', 'urgent'));

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);

create table if not exists public.conversations (
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

create unique index if not exists conversations_space_uidx
  on public.conversations (space_id)
  where type = 'space';

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- Helpers (security definer so RLS policies do not recurse)
-- -----------------------------------------------------------------------------
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

-- Guard profile handbook columns so clients cannot self-attest without signing
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

drop trigger if exists profiles_protect_handbook on public.profiles;
create trigger profiles_protect_handbook
  before update on public.profiles
  for each row execute function public.protect_handbook_fields();

-- New staff join the default ADMEXO space + channel
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

drop trigger if exists profiles_default_space on public.profiles;
create trigger profiles_default_space
  after insert on public.profiles
  for each row execute function public.add_profile_to_default_space();

-- -----------------------------------------------------------------------------
-- RPCs
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

grant execute on function public.has_signed_handbook() to authenticated;
grant execute on function public.can_create_spaces() to authenticated;
grant execute on function public.is_space_member(uuid) to authenticated;
grant execute on function public.is_space_member_user(uuid, uuid) to authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.task_space_id(uuid) to authenticated;
grant execute on function public.acknowledge_handbook(text, text, text) to authenticated;
grant execute on function public.create_space(text, text) to authenticated;
grant execute on function public.add_space_member(uuid, uuid) to authenticated;
grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.chat_unread_count() to authenticated;

revoke all on function public.acknowledge_handbook(text, text, text) from public, anon;
revoke all on function public.create_space(text, text) from public, anon;
revoke all on function public.add_space_member(uuid, uuid) from public, anon;
revoke all on function public.get_or_create_dm(uuid) from public, anon;
revoke all on function public.create_group_conversation(text, uuid[]) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.chat_unread_count() from public, anon;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.handbook_acknowledgements enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'handbook_acknowledgements','spaces','space_members','tasks','task_comments',
        'conversations','conversation_members','messages'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

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
  using (public.has_signed_handbook() and public.is_space_member(space_id) and created_by = auth.uid());

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

grant select, insert, update, delete on public.handbook_acknowledgements to authenticated;
grant select, insert, update, delete on public.spaces to authenticated;
grant select, insert, update, delete on public.space_members to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.task_comments to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.conversation_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
alter table public.messages replica identity full;
alter table public.task_comments replica identity full;

do $$
begin
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
end $$;

-- -----------------------------------------------------------------------------
-- Seed default Space ADMEXO + channel, add every current login
-- -----------------------------------------------------------------------------
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

  select id into v_space_id
  from public.spaces
  where lower(name) = 'admexo'
  order by created_at
  limit 1;

  if v_space_id is null then
    insert into public.spaces (name, color, created_by)
    values ('ADMEXO', '#FF5A1F', v_creator)
    returning id into v_space_id;
  end if;

  insert into public.space_members (space_id, user_id)
  select v_space_id, p.id from public.profiles p
  on conflict do nothing;

  select id into v_conv_id
  from public.conversations
  where type = 'space' and space_id = v_space_id
  limit 1;

  if v_conv_id is null then
    insert into public.conversations (type, space_id, name)
    values ('space', v_space_id, 'ADMEXO')
    returning id into v_conv_id;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  select v_conv_id, sm.user_id
  from public.space_members sm
  where sm.space_id = v_space_id
  on conflict do nothing;
end $$;
