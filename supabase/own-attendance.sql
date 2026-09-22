-- Paste in Supabase SQL Editor.
-- Lets a signed-in person read their own attendance (matched by Staff user_id / employee code).
-- Operators keep existing staff policies.

drop policy if exists "own attendance days" on public.attendance_days;
drop policy if exists "own monthly summaries" on public.monthly_summaries;

create policy "own attendance days"
  on public.attendance_days
  for select
  to authenticated
  using (
    employee_id in (select id from public.employees where user_id = auth.uid())
    or regexp_replace(coalesce(employee_code, ''), '^0+', '') in (
      select regexp_replace(coalesce(employee_code, ''), '^0+', '')
      from public.employees
      where user_id = auth.uid()
        and coalesce(employee_code, '') <> ''
    )
  );

create policy "own monthly summaries"
  on public.monthly_summaries
  for select
  to authenticated
  using (
    employee_id in (select id from public.employees where user_id = auth.uid())
    or regexp_replace(coalesce(employee_code, ''), '^0+', '') in (
      select regexp_replace(coalesce(employee_code, ''), '^0+', '')
      from public.employees
      where user_id = auth.uid()
        and coalesce(employee_code, '') <> ''
    )
  );
