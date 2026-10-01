-- Paste in the Supabase SQL editor. Safe to re-run.
-- Profile photos. Everyone can set their own; everyone on staff can see them.

alter table public.profiles add column if not exists avatar_url text;

-- Only used when Cloudflare R2 keys are not set. R2 deployments can ignore this part.
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 3145728)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

drop policy if exists "avatars are readable" on storage.objects;
drop policy if exists "staff write avatars" on storage.objects;

create policy "avatars are readable" on storage.objects
  for select
  using (bucket_id = 'avatars');

create policy "staff write avatars" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars');
