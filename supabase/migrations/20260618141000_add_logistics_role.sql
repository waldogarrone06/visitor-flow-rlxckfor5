DO $$
BEGIN
  -- Add role column to profiles to distinguish user types
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'visitor';

  -- Seed the test user to have the logistics role
  UPDATE public.profiles
  SET role = 'logistics'
  WHERE email = 'wal@fourlabnutri.com.br';
END $$;

-- Add RLS policies for Logistics Role on appointments table
DROP POLICY IF EXISTS "logistics_appointments_select" ON public.appointments;
CREATE POLICY "logistics_appointments_select" ON public.appointments
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'logistics'));

DROP POLICY IF EXISTS "logistics_appointments_update" ON public.appointments;
CREATE POLICY "logistics_appointments_update" ON public.appointments
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'logistics'));

-- Add RLS policies for Logistics Role on contacts table to view customer details
DROP POLICY IF EXISTS "logistics_contacts_select" ON public.contacts;
CREATE POLICY "logistics_contacts_select" ON public.contacts
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'logistics'));
