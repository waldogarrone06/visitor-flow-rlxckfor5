DO $$
BEGIN
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS specialty text;
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS professional_id text;
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS clinic_address text;
END $$;
