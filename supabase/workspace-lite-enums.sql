-- =============================================================================
-- STEP 1 of 2 — run this ALONE, then wait until it succeeds.
-- Do not paste workspace-lite.sql in the same run.
-- =============================================================================

alter type public.app_role add value if not exists 'employee';
alter type public.app_role add value if not exists 'manager';
alter type public.task_status add value if not exists 'in_review';
alter type public.task_status add value if not exists 'cancelled';
