-- Paste in the Supabase SQL editor. Safe to re-run.
-- Lets boards and the dashboard pick up new or assigned tasks without a full reload.

alter table public.tasks replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
    ) then
      alter publication supabase_realtime add table public.tasks;
    end if;
  end if;
end $$;
