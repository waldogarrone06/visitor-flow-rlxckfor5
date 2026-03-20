-- Migration: fix_admin_status
DO $$
BEGIN
  -- Ensure admin@example.com is set as an administrator if they exist in the DB
  UPDATE public.profiles
  SET is_admin = true
  WHERE email = 'admin@example.com';

  -- If there are absolutely no admins at all in the system, 
  -- fallback to making the oldest registered user an admin to prevent lockouts.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE is_admin = true) THEN
    UPDATE public.profiles
    SET is_admin = true
    WHERE id = (
      SELECT id FROM public.profiles
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1
    );
  END IF;
END $$;

-- Update RLS for profiles table
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (SELECT is_admin FROM public.profiles p WHERE p.id = auth.uid()) = true
  );

-- Ensure handle_new_user is correct and correctly populates public.user_integrations
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, is_admin)
  VALUES (
    NEW.id, 
    NEW.email, 
    coalesce(NEW.raw_user_meta_data->>'name', 'Usuário'),
    false
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_integrations (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
