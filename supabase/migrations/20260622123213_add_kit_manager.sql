DO $$
DECLARE
  new_user_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'anderson@fourlabnutri.com.br') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'anderson@fourlabnutri.com.br',
      crypt('Fourlab@4lab', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Anderson"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL,
      '', '', ''
    );

    INSERT INTO public.profiles (id, email, name, role)
    VALUES (new_user_id, 'anderson@fourlabnutri.com.br', 'Anderson', 'kit_manager')
    ON CONFLICT (id) DO UPDATE SET role = 'kit_manager';
  END IF;
END $$;

DROP POLICY IF EXISTS "kit_manager_appointments_select" ON public.appointments;
CREATE POLICY "kit_manager_appointments_select" ON public.appointments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'kit_manager'));

DROP POLICY IF EXISTS "kit_manager_appointments_update" ON public.appointments;
CREATE POLICY "kit_manager_appointments_update" ON public.appointments
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'kit_manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'kit_manager'));

DROP POLICY IF EXISTS "kit_manager_kits_select" ON public.kits;
CREATE POLICY "kit_manager_kits_select" ON public.kits
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'kit_manager'));

DROP POLICY IF EXISTS "kit_manager_kits_all" ON public.kits;
CREATE POLICY "kit_manager_kits_all" ON public.kits
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'kit_manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'kit_manager'));

DROP POLICY IF EXISTS "kit_manager_inventory_items_all" ON public.inventory_items;
CREATE POLICY "kit_manager_inventory_items_all" ON public.inventory_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'kit_manager'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'kit_manager'));
