DO $DO$
BEGIN
  ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS reminder_email_template TEXT,
  ADD COLUMN IF NOT EXISTS reminder_whatsapp_template TEXT,
  ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT false;

  ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false;
END $DO$;
