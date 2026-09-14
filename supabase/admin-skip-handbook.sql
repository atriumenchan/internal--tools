-- Admin skips the handbook gate. Staff still must sign.
-- Paste this whole file into SQL Editor and run it. Do NOT run reset.sql.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role = 'admin' or lower(email) = 'ryan@admexo.com')
  );
$$;

create or replace function public.has_signed_handbook()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.profiles p
      cross join public.company_settings s
      where p.id = auth.uid()
        and s.id = 1
        and p.handbook_version is not null
        and p.handbook_version = s.handbook_version
    );
$$;
