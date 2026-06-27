-- Ensure address columns exist in the appointments table
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS clinic_address TEXT,
  ADD COLUMN IF NOT EXISTS clinic_number TEXT,
  ADD COLUMN IF NOT EXISTS clinic_complement TEXT,
  ADD COLUMN IF NOT EXISTS clinic_neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS clinic_cep TEXT,
  ADD COLUMN IF NOT EXISTS is_address_edited BOOLEAN DEFAULT false;

-- Ensure RLS allows authenticated users to manage their own appointments (which implicitly covers UPDATE)
DROP POLICY IF EXISTS "Users manage own appointments" ON public.appointments;
CREATE POLICY "Users manage own appointments" ON public.appointments
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Optional column-level grants to ensure exact permission fulfillment as required
GRANT UPDATE (clinic_address, clinic_number, clinic_complement, clinic_neighborhood, clinic_cep, is_address_edited) 
  ON public.appointments TO authenticated;
