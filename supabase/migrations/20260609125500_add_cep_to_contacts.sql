ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS clinic_cep TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS client_document TEXT;
