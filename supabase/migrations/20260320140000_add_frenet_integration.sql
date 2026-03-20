DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_integrations' AND column_name = 'frenet_token') THEN
    ALTER TABLE public.user_integrations ADD COLUMN frenet_token text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'delivered_at') THEN
    ALTER TABLE public.appointments ADD COLUMN delivered_at timestamptz;
  END IF;
END $$;
