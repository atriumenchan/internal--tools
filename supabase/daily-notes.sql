-- Paste in the Supabase SQL Editor. Safe to re-run.
-- Personal day-wise notes. Only the owner can read or write their rows.
-- Does not touch tasks, chat, or attendance.

create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, work_date)
);

create index if not exists daily_notes_user_date_idx
  on public.daily_notes (user_id, work_date desc);

drop trigger if exists daily_notes_updated_at on public.daily_notes;
create trigger daily_notes_updated_at
  before update on public.daily_notes
  for each row execute function public.set_updated_at();

alter table public.daily_notes enable row level security;

drop policy if exists "own daily notes read" on public.daily_notes;
drop policy if exists "own daily notes insert" on public.daily_notes;
drop policy if exists "own daily notes update" on public.daily_notes;
drop policy if exists "own daily notes delete" on public.daily_notes;

create policy "own daily notes read"
  on public.daily_notes for select to authenticated
  using (user_id = auth.uid());

create policy "own daily notes insert"
  on public.daily_notes for insert to authenticated
  with check (user_id = auth.uid());

create policy "own daily notes update"
  on public.daily_notes for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "own daily notes delete"
  on public.daily_notes for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.daily_notes to authenticated;
