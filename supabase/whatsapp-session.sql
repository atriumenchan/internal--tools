-- Paste in the Supabase SQL editor. Safe to re-run.
-- Remembers when someone tapped Got it, so the next 24 hours go out as normal WhatsApp messages.

alter table public.profiles add column if not exists whatsapp_session_until timestamptz;
comment on column public.profiles.whatsapp_session_until is 'WhatsApp will accept normal messages to this person until this time.';
