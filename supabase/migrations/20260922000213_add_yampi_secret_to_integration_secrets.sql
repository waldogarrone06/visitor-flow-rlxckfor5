-- Migration to add yampi_secret to integration_secrets
ALTER TABLE public.integration_secrets
  ADD COLUMN IF NOT EXISTS yampi_secret TEXT;

-- Ensure indicator in user_integrations reflects if both or either secret is set
UPDATE public.user_integrations ui
SET yampi_configured = EXISTS(
  SELECT 1 FROM public.integration_secrets isec
  WHERE isec.user_id = ui.user_id
  AND ((isec.yampi_token IS NOT NULL AND isec.yampi_token != '') OR (isec.yampi_secret IS NOT NULL AND isec.yampi_secret != ''))
);
