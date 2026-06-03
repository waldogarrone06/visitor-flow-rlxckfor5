DO $$
BEGIN
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS kit_status TEXT DEFAULT 'Pending';
END $$;
