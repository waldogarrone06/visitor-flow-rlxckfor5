-- Ensure RLS is enabled on all dashboard-related tables
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

-- Appointments: authenticated users can select their own data
DROP POLICY IF EXISTS "dashboard_appointments_select_own" ON public.appointments;
CREATE POLICY "dashboard_appointments_select_own" ON public.appointments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Contacts: authenticated users can select their own data
DROP POLICY IF EXISTS "dashboard_contacts_select_own" ON public.contacts;
CREATE POLICY "dashboard_contacts_select_own" ON public.contacts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Kits: authenticated users can select their own data
DROP POLICY IF EXISTS "dashboard_kits_select_own" ON public.kits;
CREATE POLICY "dashboard_kits_select_own" ON public.kits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Inventory items: authenticated users can select their own data
DROP POLICY IF EXISTS "dashboard_inventory_select_own" ON public.inventory_items;
CREATE POLICY "dashboard_inventory_select_own" ON public.inventory_items
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- NPS responses: authenticated users can select responses for their own appointments
DROP POLICY IF EXISTS "dashboard_nps_select_own" ON public.nps_responses;
CREATE POLICY "dashboard_nps_select_own" ON public.nps_responses
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.appointments
      WHERE appointments.id = nps_responses.appointment_id
      AND appointments.user_id = auth.uid()
    )
  );

-- Ensure seed user wal@fourlabnutri.com.br exists with correct token columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'wal@fourlabnutri.com.br') THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'wal@fourlabnutri.com.br',
      crypt('Skip@Pass123', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Walquiria"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL,
      '', '', ''
    );
  END IF;

  -- Ensure profile exists and is admin
  INSERT INTO public.profiles (id, email, name, is_admin)
  SELECT id, email, 'Walquiria', true
  FROM auth.users
  WHERE email = 'wal@fourlabnutri.com.br'
  ON CONFLICT (id) DO UPDATE
  SET is_admin = true, name = 'Walquiria';

  -- Ensure user_integrations record exists
  INSERT INTO public.user_integrations (user_id)
  SELECT id FROM auth.users WHERE email = 'wal@fourlabnutri.com.br'
  ON CONFLICT (user_id) DO NOTHING;
END $$;
