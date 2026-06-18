DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- 1. Clean up test records to remove them from the CRM board
  -- Delete dependent records from nps_responses first to avoid foreign key constraints
  DELETE FROM public.nps_responses 
  WHERE appointment_id IN (
    SELECT id FROM public.appointments 
    WHERE client_name ILIKE ANY (ARRAY['joao silva', 'maria souza', 'carlos santos', 'joão silva'])
  );

  -- Delete the target test appointments
  DELETE FROM public.appointments 
  WHERE client_name ILIKE ANY (ARRAY['joao silva', 'maria souza', 'carlos santos', 'joão silva']);

  -- 2. Seed initial user (wal@fourlabnutri.com.br)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'wal@fourlabnutri.com.br') THEN
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
      'wal@fourlabnutri.com.br',
      crypt('Skip@Pass123', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Wal"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL,  -- MUST be NULL due to UNIQUE constraint
      '', '', ''
    );

    -- Insert into public.profiles for application logic consistency
    INSERT INTO public.profiles (id, email, name, is_admin)
    VALUES (new_user_id, 'wal@fourlabnutri.com.br', 'Wal', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
