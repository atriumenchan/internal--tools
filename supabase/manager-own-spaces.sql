-- Paste in the Supabase SQL editor. Safe to re-run.
-- A manager sees a board only when they are on it, created it, or have a task on it.
-- Ryan still sees every board.

drop policy if exists "members read spaces" on public.spaces;
create policy "members read spaces"
  on public.spaces for select to authenticated
  using (
    public.has_signed_handbook()
    and (
      public.is_admin()
      or public.is_space_member(id)
      or created_by = auth.uid()
      or exists (
        select 1 from public.tasks t
        where t.space_id = id
          and (t.created_by = auth.uid() or t.assignee_id = auth.uid())
      )
    )
  );

drop policy if exists "members read space members" on public.space_members;
create policy "members read space members"
  on public.space_members for select to authenticated
  using (
    public.has_signed_handbook()
    and (
      public.is_admin()
      or public.is_space_member(space_id)
      or exists (
        select 1 from public.spaces s
        where s.id = space_id and s.created_by = auth.uid()
      )
    )
  );

drop policy if exists "members read tasks" on public.tasks;
create policy "members read tasks"
  on public.tasks for select to authenticated
  using (
    public.has_signed_handbook()
    and (
      public.is_admin()
      or public.is_space_member(space_id)
      or created_by = auth.uid()
      or assignee_id = auth.uid()
    )
  );

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
        public.is_admin()
        or public.is_space_member(t.space_id)
        or t.created_by = auth.uid()
        or t.assignee_id = auth.uid()
      )
  );
$$;
