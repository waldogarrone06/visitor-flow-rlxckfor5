-- Create protected secrets table (only service_role can access via RLS bypass)
CREATE TABLE IF NOT EXISTS public.integration_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  whatsapp_official_access_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS with NO policies — only service_role (which bypasses RLS) can access
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;

-- Add boolean indicator column to user_integrations
ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS whatsapp_official_configured BOOLEAN DEFAULT false;

-- Migrate existing tokens from user_integrations into integration_secrets
INSERT INTO public.integration_secrets (user_id, whatsapp_official_access_token)
SELECT user_id, whatsapp_official_access_token
FROM public.user_integrations
WHERE whatsapp_official_access_token IS NOT NULL
  AND whatsapp_official_access_token != ''
ON CONFLICT (user_id) DO NOTHING;

-- Update indicator column based on migrated data
UPDATE public.user_integrations ui
SET whatsapp_official_configured = EXISTS(
  SELECT 1 FROM public.integration_secrets isec
  WHERE isec.user_id = ui.user_id
  AND isec.whatsapp_official_access_token IS NOT NULL
  AND isec.whatsapp_official_access_token != ''
)
WHERE ui.whatsapp_official_configured IS NULL
   OR ui.whatsapp_official_configured = false;

-- NULL out the token in user_integrations — it now lives only in integration_secrets
UPDATE public.user_integrations
SET whatsapp_official_access_token = NULL
WHERE whatsapp_official_access_token IS NOT NULL;

-- Ensure seed user has indicator set correctly
UPDATE public.user_integrations
SET whatsapp_official_configured = EXISTS(
  SELECT 1 FROM public.integration_secrets isec
  WHERE isec.user_id = public.user_integrations.user_id
  AND isec.whatsapp_official_access_token IS NOT NULL
  AND isec.whatsapp_official_access_token != ''
);
