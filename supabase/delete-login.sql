-- Paste in the Supabase SQL Editor. Safe to re-run.
-- Staff delete fails with "Database error deleting user" because boards/tasks
-- still list that login as created_by (ON DELETE RESTRICT).
--
-- After this paste, delete someone immediately (example):
--   select public.delete_staff_login('trial@admexo.com');

create or replace function public.prepare_staff_delete(p_user_id uuid, p_successor_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_successor_id is null then
    raise exception 'Missing user.';
  end if;
  if p_user_id = p_successor_id then
    raise exception 'You cannot delete your own login.';
  end if;

  update public.employees set user_id = null where user_id = p_user_id;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'spaces') then
    update public.spaces set created_by = p_successor_id where created_by = p_user_id;
  end if;

  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'tasks' and t.tgname = 'tasks_enforce_owner' and not t.tgisinternal
  ) then
    execute 'alter table public.tasks disable trigger tasks_enforce_owner';
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tasks') then
    update public.tasks set created_by = p_successor_id where created_by = p_user_id;
    update public.tasks set assignee_id = null where assignee_id = p_user_id;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'tasks' and column_name = 'reviewer_id'
    ) then
      execute 'update public.tasks set reviewer_id = null where reviewer_id = $1' using p_user_id;
    end if;
  end if;

  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'tasks' and t.tgname = 'tasks_enforce_owner' and not t.tgisinternal
  ) then
    execute 'alter table public.tasks enable trigger tasks_enforce_owner';
  end if;
end;
$$;

create or replace function public.delete_staff_login(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_admin uuid;
  v_email text := lower(trim(p_email));
begin
  if v_email = '' then
    raise exception 'Email is required.';
  end if;
  if v_email = 'ryan@admexo.com' then
    raise exception 'The admin login cannot be deleted.';
  end if;

  select id into v_id from public.profiles where lower(email) = v_email;
  if v_id is null then
    select id into v_id from auth.users where lower(email) = v_email;
  end if;
  if v_id is null then
    raise exception 'No login for %', v_email;
  end if;

  if exists (
    select 1 from public.profiles
    where id = v_id and (role = 'admin' or lower(email) = 'ryan@admexo.com')
  ) then
    raise exception 'The admin login cannot be deleted.';
  end if;

  select id into v_admin
  from public.profiles
  where role = 'admin' or lower(email) = 'ryan@admexo.com'
  order by case when lower(email) = 'ryan@admexo.com' then 0 else 1 end
  limit 1;

  if v_admin is null or v_admin = v_id then
    raise exception 'Need another admin to take over boards/tasks.';
  end if;

  perform public.prepare_staff_delete(v_id, v_admin);
  delete from auth.users where id = v_id;
  return 'Deleted ' || v_email;
end;
$$;

create or replace function public.reassign_profile_owned_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
begin
  select id into v_admin
  from public.profiles
  where id is distinct from old.id
    and (role = 'admin' or lower(email) = 'ryan@admexo.com')
  order by case when lower(email) = 'ryan@admexo.com' then 0 else 1 end
  limit 1;
  if v_admin is null then
    select id into v_admin from public.profiles where id is distinct from old.id limit 1;
  end if;
  if v_admin is null then
    raise exception 'Cannot delete the last login.';
  end if;
  perform public.prepare_staff_delete(old.id, v_admin);
  return old;
end;
$$;

drop trigger if exists profiles_reassign_before_delete on public.profiles;
create trigger profiles_reassign_before_delete
  before delete on public.profiles
  for each row execute function public.reassign_profile_owned_rows();

revoke all on function public.prepare_staff_delete(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_staff_login(text) from public, anon, authenticated;
grant execute on function public.prepare_staff_delete(uuid, uuid) to service_role;
grant execute on function public.delete_staff_login(text) to service_role;
