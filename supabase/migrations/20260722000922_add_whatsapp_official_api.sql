-- Add WhatsApp Official API (Meta Cloud API) columns to user_integrations
ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS whatsapp_provider_type TEXT DEFAULT 'official',
  ADD COLUMN IF NOT EXISTS whatsapp_official_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_official_waba_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_official_verify_token TEXT DEFAULT 'vf_wh_2026_k9Xm2pQ7nR4tZ',
  ADD COLUMN IF NOT EXISTS whatsapp_official_access_token TEXT;

-- Set default verify token for existing rows that have NULL
UPDATE public.user_integrations
SET whatsapp_official_verify_token = 'vf_wh_2026_k9Xm2pQ7nR4tZ'
WHERE whatsapp_official_verify_token IS NULL;

-- Set default provider type for existing rows
UPDATE public.user_integrations
SET whatsapp_provider_type = 'official'
WHERE whatsapp_provider_type IS NULL;

-- Ensure seed user wal@fourlabnutri.com.br has a user_integrations record
INSERT INTO public.user_integrations (user_id, whatsapp_provider_type, whatsapp_official_verify_token)
SELECT id, 'official', 'vf_wh_2026_k9Xm2pQ7nR4tZ'
FROM auth.users
WHERE email = 'wal@fourlabnutri.com.br'
ON CONFLICT (user_id) DO UPDATE
SET whatsapp_provider_type = COALESCE(user_integrations.whatsapp_provider_type, 'official'),
    whatsapp_official_verify_token = COALESCE(user_integrations.whatsapp_official_verify_token, 'vf_wh_2026_k9Xm2pQ7nR4tZ');
