DO $$
BEGIN
    -- Ensure the policy exists for anon inserts
    DROP POLICY IF EXISTS "Anon can insert appointments" ON public.appointments;
    CREATE POLICY "Anon can insert appointments" ON public.appointments
      FOR INSERT TO anon WITH CHECK (true);
      
    -- Index to help with queries filtering out 'Lead' status
    CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments USING btree (status);
END $$;
