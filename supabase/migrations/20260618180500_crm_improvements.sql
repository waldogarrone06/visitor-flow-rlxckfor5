-- Ensure ON DELETE CASCADE for nps_responses -> appointments
ALTER TABLE public.nps_responses
  DROP CONSTRAINT IF EXISTS nps_responses_appointment_id_fkey,
  ADD CONSTRAINT nps_responses_appointment_id_fkey
    FOREIGN KEY (appointment_id)
    REFERENCES public.appointments(id)
    ON DELETE CASCADE;

-- Ensure delete policy exists
DROP POLICY IF EXISTS "Users can delete own appointments" ON public.appointments;
CREATE POLICY "Users can delete own appointments" ON public.appointments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Seed data for revisita tag
-- AUDIT FIX: nenhuma senha fixa em migration — se o usuário não existe, é criado
-- com senha aleatória descartável (redefinição via e-mail, card "Senhas padrão
-- a redefinir"); se já existe, NADA é feito (nenhum UPDATE de senha).
DO $$
DECLARE
  v_user_id uuid;
BEGIN
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
      crypt(gen_random_uuid()::text, gen_salt('bf')), -- senha aleatória descartável (redefinir via e-mail)
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Wal"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, email, name, is_admin)
    VALUES (v_user_id, 'wal@fourlabnutri.com.br', 'Wal', true)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'wal@fourlabnutri.com.br';
  END IF;

  -- Insert tag
  IF NOT EXISTS (SELECT 1 FROM public.contact_tags WHERE user_id = v_user_id AND name = 'revisita') THEN
    INSERT INTO public.contact_tags (user_id, name, color)
    VALUES (v_user_id, 'revisita', '#f59e0b');
  END IF;
END $$;
