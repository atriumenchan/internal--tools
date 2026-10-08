-- Paste in the Supabase SQL editor. Safe to re-run.
-- Staff WhatsApp numbers, and a send-once flag on in-app alerts.
-- Gaurav Mishra is set to 916307276542 for the first live test.

alter table public.profiles add column if not exists whatsapp_phone text;
comment on column public.profiles.whatsapp_phone is 'WhatsApp mobile in digits, e.g. 916307276542.';

alter table public.notifications add column if not exists whatsapp_sent_at timestamptz;
update public.notifications
set whatsapp_sent_at = created_at
where whatsapp_sent_at is null;

update public.profiles
set whatsapp_phone = '916307276542'
where lower(trim(full_name)) = 'gaurav mishra';
