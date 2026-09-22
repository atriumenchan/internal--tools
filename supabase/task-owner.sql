-- Paste in the Supabase SQL editor. Safe to re-run.
-- Only the task creator or a manager/admin can change or delete a task.
-- Comments stay open to board members.

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

create or replace function public.can_manage_task(p_created_by uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_created_by = auth.uid() or public.is_manager();
$$;

grant execute on function public.is_manager() to authenticated;
grant execute on function public.can_manage_task(uuid) to authenticated;

drop policy if exists "members update tasks" on public.tasks;
create policy "members update tasks"
  on public.tasks for update to authenticated
  using (
    public.has_signed_handbook()
    and public.is_space_member(space_id)
    and public.can_manage_task(created_by)
  )
  with check (
    public.has_signed_handbook()
    and public.is_space_member(space_id)
    and public.can_manage_task(created_by)
    and (assignee_id is null or public.is_space_member_user(space_id, assignee_id))
  );

drop policy if exists "members delete tasks" on public.tasks;
create policy "members delete tasks"
  on public.tasks for delete to authenticated
  using (
    public.has_signed_handbook()
    and public.is_space_member(space_id)
    and public.can_manage_task(created_by)
  );

create or replace function public.enforce_task_owner()
returns trigger
language plpgsql
as $$
begin
  if not public.can_manage_task(old.created_by) then
    raise exception 'Only the person who created this task, or a manager, can change it.';
  end if;
  new.created_by := old.created_by;
  return new;
end;
$$;

drop trigger if exists tasks_enforce_done on public.tasks;
drop trigger if exists tasks_enforce_owner on public.tasks;
create trigger tasks_enforce_owner
  before update on public.tasks
  for each row execute function public.enforce_task_owner();

do $$ begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'task_files'
  ) then
    execute 'drop policy if exists "members insert task files" on public.task_files';
    execute 'drop policy if exists "members delete task files" on public.task_files';
    execute $p$
      create policy "members insert task files"
        on public.task_files for insert to authenticated
        with check (
          public.has_signed_handbook()
          and public.is_space_member(public.task_space_id(task_id))
          and exists (
            select 1 from public.tasks t
            where t.id = task_id and public.can_manage_task(t.created_by)
          )
        )
    $p$;
    execute $p$
      create policy "members delete task files"
        on public.task_files for delete to authenticated
        using (
          public.has_signed_handbook()
          and public.is_space_member(public.task_space_id(task_id))
          and exists (
            select 1 from public.tasks t
            where t.id = task_id and public.can_manage_task(t.created_by)
          )
        )
    $p$;
  end if;
end $$;
