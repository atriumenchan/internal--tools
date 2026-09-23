-- Paste in the Supabase SQL Editor. Safe to re-run.
-- Storage for the live handbook PDF. Publishing a new version only updates
-- company_settings.handbook_version — it does not delete tasks, chat, or logins.

insert into storage.buckets (id, name, public, file_size_limit)
values ('handbook', 'handbook', false, 20971520)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "handbook read" on storage.objects;
drop policy if exists "handbook write" on storage.objects;

create policy "handbook read"
  on storage.objects for select to authenticated
  using (bucket_id = 'handbook');

create policy "handbook write"
  on storage.objects for all to authenticated
  using (bucket_id = 'handbook' and public.is_admin())
  with check (bucket_id = 'handbook' and public.is_admin());
