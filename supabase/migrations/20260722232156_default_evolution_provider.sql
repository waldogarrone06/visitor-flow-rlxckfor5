-- Change default provider type from 'official' to 'evolution'
ALTER TABLE public.user_integrations
  ALTER COLUMN whatsapp_provider_type SET DEFAULT 'evolution';

-- Update existing rows that have NULL or empty provider type
UPDATE public.user_integrations
SET whatsapp_provider_type = 'evolution'
WHERE whatsapp_provider_type IS NULL OR whatsapp_provider_type = '';
