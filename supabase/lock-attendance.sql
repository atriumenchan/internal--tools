-- Paste in the Supabase SQL Editor. Safe to re-run.
-- Saved attendance days cannot be updated or deleted.

create or replace function public.protect_saved_attendance()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Attendance for this date is already saved and cannot be changed.';
end;
$$;

drop trigger if exists attendance_days_no_update on public.attendance_days;
create trigger attendance_days_no_update
  before update on public.attendance_days
  for each row execute function public.protect_saved_attendance();

drop trigger if exists attendance_days_no_delete on public.attendance_days;
create trigger attendance_days_no_delete
  before delete on public.attendance_days
  for each row execute function public.protect_saved_attendance();

drop policy if exists "staff write days" on public.attendance_days;
drop policy if exists "staff insert days" on public.attendance_days;
create policy "staff insert days"
  on public.attendance_days
  for insert
  to authenticated
  with check (public.is_staff());
