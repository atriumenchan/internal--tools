-- Paste in the Supabase SQL editor. Safe to re-run.
-- You can delete your own alerts.

grant select, update, delete on public.notifications to authenticated;

drop policy if exists "delete own notifications" on public.notifications;
create policy "delete own notifications"
  on public.notifications for delete to authenticated
  using (user_id = auth.uid());
