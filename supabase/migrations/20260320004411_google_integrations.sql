DO $$
BEGIN
  -- Create profiles table
  CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  -- Alter appointments
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS google_event_id TEXT;
  ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS google_meet_link TEXT;

  -- Alter user_integrations
  ALTER TABLE public.user_integrations ADD COLUMN IF NOT EXISTS google_invitation_body TEXT;
  ALTER TABLE public.user_integrations ADD COLUMN IF NOT EXISTS sync_enabled BOOLEAN DEFAULT false;

  -- Profile RLS
  ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
  CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT TO authenticated USING (true);

  DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
  CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

  -- Update user_integrations RLS to allow admins
  DROP POLICY IF EXISTS "Users can manage their own integrations" ON public.user_integrations;
  CREATE POLICY "Users can manage their own integrations" ON public.user_integrations
    FOR ALL TO authenticated
    USING (
      auth.uid() = user_id OR 
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    )
    WITH CHECK (
      auth.uid() = user_id OR 
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
END $$;

-- Trigger for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, coalesce(NEW.raw_user_meta_data->>'name', 'Usuário'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_integrations (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed Data
DO $$
DECLARE
  admin_id UUID := gen_random_uuid();
  normal_user_id UUID := gen_random_uuid();
BEGIN
  -- Admin
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@example.com') THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, 
      created_at, updated_at, role, aud, 
      confirmation_token, recovery_token, email_change_token_new, 
      email_change, email_change_token_current, phone_change, 
      phone_change_token, reauthentication_token
    ) VALUES (
      admin_id, '00000000-0000-0000-0000-000000000000', 'admin@example.com', 
      crypt('Admin123!', gen_salt('bf')), NOW(), NOW(), NOW(), 
      'authenticated', 'authenticated', 
      '', '', '', '', '', '', '', ''
    );

    INSERT INTO public.profiles (id, email, name, is_admin) 
    VALUES (admin_id, 'admin@example.com', 'Administrador Global', true) 
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_integrations (user_id) 
    VALUES (admin_id) 
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Normal User
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'user@example.com') THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at, 
      created_at, updated_at, role, aud, 
      confirmation_token, recovery_token, email_change_token_new, 
      email_change, email_change_token_current, phone_change, 
      phone_change_token, reauthentication_token
    ) VALUES (
      normal_user_id, '00000000-0000-0000-0000-000000000000', 'user@example.com', 
      crypt('User123!', gen_salt('bf')), NOW(), NOW(), NOW(), 
      'authenticated', 'authenticated', 
      '', '', '', '', '', '', '', ''
    );

    INSERT INTO public.profiles (id, email, name, is_admin) 
    VALUES (normal_user_id, 'user@example.com', 'Atendente Comercial', false) 
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_integrations (user_id) 
    VALUES (normal_user_id) 
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;
