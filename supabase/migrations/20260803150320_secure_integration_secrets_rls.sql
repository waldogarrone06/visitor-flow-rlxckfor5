-- Enable RLS on integration_secrets so credentials are protected
-- Edge functions use service_role which bypasses RLS
-- Frontend accesses credentials only through edge functions
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies that might allow uncontrolled access
DROP POLICY IF EXISTS "integration_secrets_select" ON public.integration_secrets;
DROP POLICY IF EXISTS "integration_secrets_insert" ON public.integration_secrets;
DROP POLICY IF EXISTS "integration_secrets_update" ON public.integration_secrets;
DROP POLICY IF EXISTS "integration_secrets_delete" ON public.integration_secrets;
DROP POLICY IF EXISTS "Users manage own integration secrets" ON public.integration_secrets;

-- Allow authenticated users to manage only their own row
-- This prevents reading other users' credentials while allowing
-- the frontend to save/read through authenticated calls if needed
CREATE POLICY "Users view own integration secrets" ON public.integration_secrets
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users insert own integration secrets" ON public.integration_secrets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own integration secrets" ON public.integration_secrets
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own integration secrets" ON public.integration_secrets
  FOR DELETE TO authenticated USING (user_id = auth.uid());
