-- Paste in the Supabase SQL editor. Safe to re-run.
-- Only the board creator, a manager, or admin can delete a space.
-- Members can still use the board.

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

drop policy if exists "members delete spaces" on public.spaces;
create policy "members delete spaces"
  on public.spaces for delete to authenticated
  using (
    public.has_signed_handbook()
    and public.is_space_member(id)
    and (created_by = auth.uid() or public.is_manager())
  );
