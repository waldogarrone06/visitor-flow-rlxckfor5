-- 1. Create a robust, non-recursive SECURITY DEFINER function to check admin status
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
BEGIN
  SELECT is_admin INTO _is_admin FROM profiles WHERE id = auth.uid();
  RETURN COALESCE(_is_admin, false);
END;
$$;

-- 2. Clean up ALL previous potentially recursive policies on profiles
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin_all" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- 3. Create strictly non-recursive policies for the profiles table
CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_read_admin" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_update_admin_all" ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_admin());

-- 4. Update the new user trigger to ensure it sets the name safely without failing
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, is_admin)
  VALUES (
    NEW.id, 
    NEW.email, 
    coalesce(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    false
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_integrations (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-apply trigger to ensure idempotent setup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Seed the required Administrator User idempotently
DO $$
DECLARE
  admin_id uuid := '1210e006-fbee-4c23-b7da-33e85e7703e0'::uuid;
BEGIN
  -- Insert into auth.users if not exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = admin_id) THEN
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      admin_id,
      '00000000-0000-0000-0000-000000000000',
      'admin@example.com',
      crypt('Admin123!', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Administrador"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );
  END IF;

  -- Ensure the profile exists and strictly enforce is_admin = true
  INSERT INTO public.profiles (id, email, name, is_admin)
  VALUES (admin_id, 'admin@example.com', 'Administrador', true)
  ON CONFLICT (id) DO UPDATE
  SET is_admin = true, name = 'Administrador', email = 'admin@example.com';
  
  -- Ensure integrations record exists
  INSERT INTO public.user_integrations (user_id)
  VALUES (admin_id)
  ON CONFLICT (user_id) DO NOTHING;
END $$;
