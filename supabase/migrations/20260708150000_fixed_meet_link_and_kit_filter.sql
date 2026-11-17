-- Create security definer function to fetch fixed_meet_link for public booking (anon-safe)
CREATE OR REPLACE FUNCTION public.get_fixed_meet_link(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link TEXT;
BEGIN
  SELECT fixed_meet_link INTO v_link
  FROM public.user_integrations
  WHERE user_id = p_user_id;

  RETURN v_link;
END;
$$;

-- Grant execute to anon (public booking) and authenticated (dashboard)
GRANT EXECUTE ON FUNCTION public.get_fixed_meet_link(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_fixed_meet_link(UUID) TO authenticated;

-- AUDIT FIX: nenhuma senha fixa em migration — cria com senha aleatória
-- descartável (redefinir via e-mail); se existe, NADA é feito.
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
      '{"name": "Walquiria"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '',
      NULL,
      '', '', ''
    );

    INSERT INTO public.profiles (id, email, name, is_admin)
    VALUES (v_user_id, 'wal@fourlabnutri.com.br', 'Walquiria', true)
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Ensure RLS policies on user_integrations for authenticated users
DROP POLICY IF EXISTS "user_integrations_select" ON public.user_integrations;
CREATE POLICY "user_integrations_select" ON public.user_integrations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_integrations_insert" ON public.user_integrations;
CREATE POLICY "user_integrations_insert" ON public.user_integrations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_integrations_update" ON public.user_integrations;
CREATE POLICY "user_integrations_update" ON public.user_integrations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_integrations_delete" ON public.user_integrations;
CREATE POLICY "user_integrations_delete" ON public.user_integrations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Ensure appointments RLS for authenticated users (manage own)
DROP POLICY IF EXISTS "Users manage own appointments" ON public.appointments;
CREATE POLICY "Users manage own appointments" ON public.appointments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
