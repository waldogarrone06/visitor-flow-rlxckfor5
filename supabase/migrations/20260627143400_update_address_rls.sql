-- Re-ensure appropriate RLS policies for updates to address fields

DO $$
BEGIN
  -- Drop and recreate the policy to ensure it allows the necessary UPDATE
  DROP POLICY IF EXISTS "Users manage own appointments" ON public.appointments;
  CREATE POLICY "Users manage own appointments" ON public.appointments
    FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
END $$;

-- Ensure column-level grants
GRANT UPDATE (clinic_address, clinic_number, clinic_complement, clinic_neighborhood, clinic_cep, is_address_edited) 
  ON public.appointments TO authenticated;
