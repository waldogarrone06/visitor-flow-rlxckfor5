ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS whatsapp_app_secret_configured BOOLEAN DEFAULT false;
