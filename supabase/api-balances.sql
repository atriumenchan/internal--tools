-- Paste in the Supabase SQL editor. Safe to re-run.
-- Current balance of paid APIs (fal.ai, DeepSeek, and anything else a script reports).

create table if not exists public.api_balances (
  provider text primary key,
  label text not null,
  status text not null check (status in ('ok', 'low', 'depleted')),
  balance text,
  message text,
  updated_at timestamptz not null default now()
);

alter table public.api_balances enable row level security;

drop policy if exists "members read api balances" on public.api_balances;
create policy "members read api balances"
  on public.api_balances for select to authenticated
  using (public.has_signed_handbook());

grant select on public.api_balances to authenticated;

alter table public.api_balances replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'api_balances'
    ) then
      alter publication supabase_realtime add table public.api_balances;
    end if;
  end if;
end $$;
