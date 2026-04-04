ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS client_id text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS status text DEFAULT 'sent';

CREATE INDEX IF NOT EXISTS messages_client_id_idx ON public.messages (client_id);
