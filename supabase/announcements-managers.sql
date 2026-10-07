-- Paste in the Supabase SQL editor. Safe to re-run.
-- Managers (and HR) can post and remove company announcements.

drop policy if exists "operators write announcements" on public.announcements;
create policy "operators write announcements" on public.announcements
  for all to authenticated
  using (public.is_operator() or public.is_manager())
  with check (public.is_operator() or public.is_manager());
