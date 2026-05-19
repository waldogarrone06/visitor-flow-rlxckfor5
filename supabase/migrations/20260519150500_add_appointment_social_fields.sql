DO $$
BEGIN
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS instagram text;
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS patients_per_month text;
END $$;
