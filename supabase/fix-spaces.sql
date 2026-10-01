-- Paste in the Supabase SQL editor. Safe to re-run.
-- Fixes: managers can see every board/task; creator or manager can delete a board
-- even when they are not a member and even when other people's tasks are on it.

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

grant execute on function public.is_manager() to authenticated;

drop policy if exists "members read spaces" on public.spaces;
create policy "members read spaces"
  on public.spaces for select to authenticated
  using (public.has_signed_handbook() and (public.is_space_member(id) or public.is_manager()));

drop policy if exists "members read space members" on public.space_members;
create policy "members read space members"
  on public.space_members for select to authenticated
  using (public.has_signed_handbook() and (public.is_space_member(space_id) or public.is_manager()));

drop policy if exists "members read tasks" on public.tasks;
create policy "members read tasks"
  on public.tasks for select to authenticated
  using (public.has_signed_handbook() and (public.is_space_member(space_id) or public.is_manager()));

drop policy if exists "members delete spaces" on public.spaces;
create policy "members delete spaces"
  on public.spaces for delete to authenticated
  using (
    public.has_signed_handbook()
    and (public.is_manager() or created_by = auth.uid())
  );

create or replace function public.delete_space(p_space_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if not public.has_signed_handbook() then
    raise exception 'Handbook must be signed.';
  end if;
  if not exists (
    select 1 from public.spaces
    where id = p_space_id
      and (created_by = auth.uid() or public.is_manager())
  ) then
    raise exception 'Only the person who created this board, or a manager, can delete it.';
  end if;
  delete from public.spaces where id = p_space_id;
end;
$$;

grant execute on function public.delete_space(uuid) to authenticated;
