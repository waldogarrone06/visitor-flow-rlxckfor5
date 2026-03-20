-- Fix auth.users nulls for GoTrue compatibility and ensure strict token strings
UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE
  confirmation_token IS NULL OR recovery_token IS NULL
  OR email_change_token_new IS NULL OR email_change IS NULL
  OR email_change_token_current IS NULL
  OR phone_change IS NULL OR phone_change_token IS NULL
  OR reauthentication_token IS NULL;

-- Enforce RLS policies for user_integrations to allow Admins full control
DROP POLICY IF EXISTS "user_integrations_select" ON public.user_integrations;
CREATE POLICY "user_integrations_select" ON public.user_integrations
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR 
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

DROP POLICY IF EXISTS "user_integrations_update" ON public.user_integrations;
CREATE POLICY "user_integrations_update" ON public.user_integrations
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id OR 
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  )
  WITH CHECK (
    auth.uid() = user_id OR 
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

DROP POLICY IF EXISTS "user_integrations_insert" ON public.user_integrations;
CREATE POLICY "user_integrations_insert" ON public.user_integrations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id OR 
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

DROP POLICY IF EXISTS "user_integrations_delete" ON public.user_integrations;
CREATE POLICY "user_integrations_delete" ON public.user_integrations
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id OR 
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

-- Enforce RLS policies for profiles to ensure Admin access
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
CREATE POLICY "profiles_read_all" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);
