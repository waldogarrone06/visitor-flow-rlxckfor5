-- Add columns for all sensitive credentials to integration_secrets
ALTER TABLE public.integration_secrets
  ADD COLUMN IF NOT EXISTS google_access_token TEXT,
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS melhor_envio_token TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_api_token TEXT,
  ADD COLUMN IF NOT EXISTS yampi_token TEXT;

-- Add indicator columns to user_integrations (non-sensitive, for UI display)
ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS google_configured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS melhor_envio_configured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_api_configured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS yampi_configured BOOLEAN DEFAULT false;

-- Migrate existing credentials from user_integrations into integration_secrets
INSERT INTO public.integration_secrets (
  user_id,
  google_access_token,
  google_refresh_token,
  melhor_envio_token,
  whatsapp_api_token,
  yampi_token,
  whatsapp_official_access_token
)
SELECT
  user_id,
  google_access_token,
  google_refresh_token,
  melhor_envio_token,
  whatsapp_api_token,
  yampi_token,
  whatsapp_official_access_token
FROM public.user_integrations
WHERE google_access_token IS NOT NULL
   OR google_refresh_token IS NOT NULL
   OR melhor_envio_token IS NOT NULL
   OR whatsapp_api_token IS NOT NULL
   OR yampi_token IS NOT NULL
   OR whatsapp_official_access_token IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  google_access_token = COALESCE(EXCLUDED.google_access_token, integration_secrets.google_access_token),
  google_refresh_token = COALESCE(EXCLUDED.google_refresh_token, integration_secrets.google_refresh_token),
  melhor_envio_token = COALESCE(EXCLUDED.melhor_envio_token, integration_secrets.melhor_envio_token),
  whatsapp_api_token = COALESCE(EXCLUDED.whatsapp_api_token, integration_secrets.whatsapp_api_token),
  yampi_token = COALESCE(EXCLUDED.yampi_token, integration_secrets.yampi_token),
  whatsapp_official_access_token = COALESCE(EXCLUDED.whatsapp_official_access_token, integration_secrets.whatsapp_official_access_token),
  updated_at = NOW();

-- Update indicator columns based on migrated data
UPDATE public.user_integrations ui
SET google_configured = EXISTS(
  SELECT 1 FROM public.integration_secrets isec
  WHERE isec.user_id = ui.user_id
  AND (isec.google_access_token IS NOT NULL AND isec.google_access_token != '')
);

UPDATE public.user_integrations ui
SET melhor_envio_configured = EXISTS(
  SELECT 1 FROM public.integration_secrets isec
  WHERE isec.user_id = ui.user_id
  AND (isec.melhor_envio_token IS NOT NULL AND isec.melhor_envio_token != '')
);

UPDATE public.user_integrations ui
SET whatsapp_api_configured = EXISTS(
  SELECT 1 FROM public.integration_secrets isec
  WHERE isec.user_id = ui.user_id
  AND (isec.whatsapp_api_token IS NOT NULL AND isec.whatsapp_api_token != '')
);

UPDATE public.user_integrations ui
SET yampi_configured = EXISTS(
  SELECT 1 FROM public.integration_secrets isec
  WHERE isec.user_id = ui.user_id
  AND (isec.yampi_token IS NOT NULL AND isec.yampi_token != '')
);

-- Drop sensitive columns from user_integrations so they are no longer readable via REST
ALTER TABLE public.user_integrations
  DROP COLUMN IF EXISTS google_access_token,
  DROP COLUMN IF EXISTS google_refresh_token,
  DROP COLUMN IF EXISTS melhor_envio_token,
  DROP COLUMN IF EXISTS whatsapp_api_token,
  DROP COLUMN IF EXISTS yampi_token,
  DROP COLUMN IF EXISTS whatsapp_official_access_token;
