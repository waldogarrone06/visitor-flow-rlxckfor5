DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Ensure DELETE RLS policy for authenticated users on appointments (leads table)
  DROP POLICY IF EXISTS "Users can delete own appointments" ON public.appointments;
  CREATE POLICY "Users can delete own appointments" ON public.appointments
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

  -- Ensure auth seed user exists with password Skip@Pass
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'wal@fourlabnutri.com.br') THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'wal@fourlabnutri.com.br',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Walquiria"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL,
      '', '', ''
    );

    INSERT INTO public.profiles (id, email, name, is_admin)
    VALUES (v_user_id, 'wal@fourlabnutri.com.br', 'Walquiria', true)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('Skip@Pass', gen_salt('bf'))
    WHERE email = 'wal@fourlabnutri.com.br';
  END IF;
END $$;
