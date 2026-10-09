-- Paste in the Supabase SQL editor. Safe to re-run.
-- Comments (and files) on a task are shared: anyone who can see the task can read them.
-- Managers were able to open every task after admin-task-view.sql, but comments still
-- required board membership, so Ryan saw an empty thread while the assignee had notes.

create or replace function public.can_see_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = p_task_id
      and (
        public.is_manager()
        or public.is_space_member(t.space_id)
        or t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
      )
  );
$$;

grant execute on function public.can_see_task(uuid) to authenticated;

drop policy if exists "members read task comments" on public.task_comments;
create policy "members read task comments"
  on public.task_comments for select to authenticated
  using (public.has_signed_handbook() and public.can_see_task(task_id));

drop policy if exists "members insert task comments" on public.task_comments;
create policy "members insert task comments"
  on public.task_comments for insert to authenticated
  with check (
    public.has_signed_handbook()
    and author_id = auth.uid()
    and public.can_see_task(task_id)
    and length(trim(body)) > 0
  );

drop policy if exists "members read task files" on public.task_files;
create policy "members read task files"
  on public.task_files for select to authenticated
  using (public.has_signed_handbook() and public.can_see_task(task_id));
