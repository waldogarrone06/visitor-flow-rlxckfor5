-- 1. Create a SECURITY DEFINER function to check admin status bypassing RLS
-- This prevents infinite recursion when evaluating policies on the profiles table
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

-- 2. Clean up old policies that caused recursion on profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;

-- 3. Create new optimized and non-recursive policies for profiles
CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_read_admin" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_update_admin_all" ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_admin());

-- 4. Clean up user_integrations policies that also used recursive subqueries
DROP POLICY IF EXISTS "user_integrations_delete" ON public.user_integrations;
DROP POLICY IF EXISTS "user_integrations_insert" ON public.user_integrations;
DROP POLICY IF EXISTS "user_integrations_select" ON public.user_integrations;
DROP POLICY IF EXISTS "user_integrations_update" ON public.user_integrations;

-- 5. Recreate user_integrations policies using the new helper function
CREATE POLICY "user_integrations_select" ON public.user_integrations
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "user_integrations_insert" ON public.user_integrations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "user_integrations_update" ON public.user_integrations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "user_integrations_delete" ON public.user_integrations
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());
