DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.interaction_log;

CREATE POLICY "Enable delete for users based on user_id" ON public.interaction_log
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
