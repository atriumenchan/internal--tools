-- Paste in the Supabase SQL editor. Safe to re-run.
-- Requester, assignee, or a manager can attach files. Uploader or requester/manager can remove them.

drop policy if exists "members insert task files" on public.task_files;
drop policy if exists "members delete task files" on public.task_files;

create policy "members insert task files"
  on public.task_files for insert to authenticated
  with check (
    public.has_signed_handbook()
    and uploaded_by = auth.uid()
    and (public.is_space_member(public.task_space_id(task_id)) or public.is_manager())
    and exists (
      select 1 from public.tasks t
      where t.id = task_id
        and (t.created_by = auth.uid() or t.assignee_id = auth.uid() or public.is_manager())
    )
  );

create policy "members delete task files"
  on public.task_files for delete to authenticated
  using (
    public.has_signed_handbook()
    and (public.is_space_member(public.task_space_id(task_id)) or public.is_manager())
    and (
      uploaded_by = auth.uid()
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and public.can_manage_task(t.created_by)
      )
    )
  );
