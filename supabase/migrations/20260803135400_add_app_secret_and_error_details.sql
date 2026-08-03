-- Add whatsapp_app_secret to integration_secrets for Meta webhook signature validation
ALTER TABLE public.integration_secrets
  ADD COLUMN IF NOT EXISTS whatsapp_app_secret TEXT;

-- Add error_details to messages for recording failed status error information
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS error_details JSONB;
