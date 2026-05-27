ALTER TABLE public.user_integrations ADD COLUMN IF NOT EXISTS melhor_envio_token TEXT;
ALTER TABLE public.user_integrations DROP COLUMN IF EXISTS frenet_token;
