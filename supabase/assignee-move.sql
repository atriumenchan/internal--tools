-- Paste in the Supabase SQL editor. Safe to re-run.
-- The person the task is assigned to can move status. Edit and delete stay with the requester or a manager.

create or replace function public.can_move_task(p_created_by uuid, p_assignee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_created_by = auth.uid() or p_assignee_id = auth.uid() or public.is_manager();
$$;

grant execute on function public.can_move_task(uuid, uuid) to authenticated;

drop policy if exists "members update tasks" on public.tasks;
create policy "members update tasks"
  on public.tasks for update to authenticated
  using (
    public.has_signed_handbook()
    and public.is_space_member(space_id)
    and public.can_move_task(created_by, assignee_id)
  )
  with check (
    public.has_signed_handbook()
    and public.is_space_member(space_id)
    and public.can_move_task(created_by, assignee_id)
    and (assignee_id is null or public.is_space_member_user(space_id, assignee_id))
  );

create or replace function public.enforce_task_owner()
returns trigger
language plpgsql
as $$
declare
  next_status public.tasks.status%type;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if public.can_manage_task(old.created_by) then
    new.created_by := old.created_by;
    return new;
  end if;
  if old.assignee_id is not distinct from auth.uid() then
    next_status := new.status;
    new := old;
    new.status := next_status;
    return new;
  end if;
  raise exception 'Only the requester, the assignee, or a manager can move this task.';
end;
$$;
