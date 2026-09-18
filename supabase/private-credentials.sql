-- Credentials are private to the person who created them.
-- Not even admin can read someone else's rows through the app.
-- Paste this whole file into SQL Editor and run it.

drop policy if exists "staff read credentials" on public.company_credentials;
drop policy if exists "staff write credentials" on public.company_credentials;
drop policy if exists "own credentials select" on public.company_credentials;
drop policy if exists "own credentials insert" on public.company_credentials;
drop policy if exists "own credentials update" on public.company_credentials;
drop policy if exists "own credentials delete" on public.company_credentials;

create policy "own credentials select" on public.company_credentials
  for select to authenticated
  using (created_by = auth.uid());

create policy "own credentials insert" on public.company_credentials
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "own credentials update" on public.company_credentials
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "own credentials delete" on public.company_credentials
  for delete to authenticated
  using (created_by = auth.uid());

alter table public.company_credentials
  alter column created_by set default auth.uid();
