-- Paste in the Supabase SQL editor. Safe to re-run.
-- Creator, assignee, or a manager can delete a task.

create or replace function public.can_delete_task(p_created_by uuid, p_assignee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_created_by = auth.uid() or p_assignee_id = auth.uid() or public.is_manager();
$$;

grant execute on function public.can_delete_task(uuid, uuid) to authenticated;

drop policy if exists "members delete tasks" on public.tasks;
create policy "members delete tasks"
  on public.tasks for delete to authenticated
  using (
    public.has_signed_handbook()
    and public.is_space_member(space_id)
    and public.can_delete_task(created_by, assignee_id)
  );
