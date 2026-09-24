-- Paste in the Supabase SQL editor. Safe to re-run.
-- Stores each login's Telegram user id so the bot can DM them.

alter table public.profiles
  add column if not exists telegram_id text;

comment on column public.profiles.telegram_id is 'Telegram user id from getUpdates from.id. The person must Start the bot once.';
