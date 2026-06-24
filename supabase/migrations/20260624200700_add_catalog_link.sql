-- Add catalog_link to user_integrations for quick access on Scheduling Page
ALTER TABLE public.user_integrations ADD COLUMN IF NOT EXISTS catalog_link TEXT;
