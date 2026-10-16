-- Paste in the Supabase SQL editor. Safe to re-run.
-- Replaced by supabase/manager-own-spaces.sql.
-- Ryan can read every board. A manager only sees boards they belong to.

drop policy if exists "members read spaces" on public.spaces;
create policy "members read spaces"
  on public.spaces for select to authenticated
  using (public.has_signed_handbook() and (public.is_space_member(id) or public.is_admin()));

drop policy if exists "members read space members" on public.space_members;
create policy "members read space members"
  on public.space_members for select to authenticated
  using (public.has_signed_handbook() and (public.is_space_member(space_id) or public.is_admin()));

drop policy if exists "members read tasks" on public.tasks;
create policy "members read tasks"
  on public.tasks for select to authenticated
  using (public.has_signed_handbook() and (public.is_space_member(space_id) or public.is_admin()));
