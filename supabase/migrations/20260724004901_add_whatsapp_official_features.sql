-- Add last_inbound_at to contacts for 24h free-text window tracking
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;

-- Add primary_provider to user_integrations for provider cutover
ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS primary_provider TEXT DEFAULT 'official';

-- Update existing rows: set primary_provider to match whatsapp_provider_type
UPDATE public.user_integrations
SET primary_provider = whatsapp_provider_type
WHERE primary_provider IS NULL AND whatsapp_provider_type IS NOT NULL;

UPDATE public.user_integrations
SET primary_provider = 'official'
WHERE primary_provider IS NULL;

-- Ensure RLS allows authenticated users to update last_inbound_at on contacts
-- (existing policies already cover ALL operations, no changes needed)
