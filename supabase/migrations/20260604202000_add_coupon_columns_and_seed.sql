ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS nutritionist_coupon TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS patient_coupon TEXT;

DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Seed user (idempotent: skip if email already exists)
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
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Wal"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, email, name, is_admin)
    VALUES (new_user_id, 'wal@fourlabnutri.com.br', 'Wal', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
