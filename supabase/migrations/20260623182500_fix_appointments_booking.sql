DO $$
BEGIN
  -- Ensure existing rows won't break the NOT NULL constraint
  UPDATE public.appointments 
  SET client_document = '000.000.000-00' 
  WHERE client_document IS NULL OR client_document = '';

  -- Enforce NOT NULL for client_document
  ALTER TABLE public.appointments ALTER COLUMN client_document SET NOT NULL;

  -- Ensure proper RLS for Anon and Authenticated inserts on appointments
  DROP POLICY IF EXISTS "Anon can insert appointments" ON public.appointments;
  CREATE POLICY "Anon can insert appointments" ON public.appointments
    FOR INSERT TO anon WITH CHECK (true);

  DROP POLICY IF EXISTS "Auth can insert appointments" ON public.appointments;
  CREATE POLICY "Auth can insert appointments" ON public.appointments
    FOR INSERT TO authenticated WITH CHECK (true);
    
  -- Also ensure contacts can be inserted by anon (so the trigger/upsert won't throw silently if we ever make it strict)
  DROP POLICY IF EXISTS "Anon can insert contacts" ON public.contacts;
  CREATE POLICY "Anon can insert contacts" ON public.contacts
    FOR INSERT TO anon WITH CHECK (true);
END $$;
