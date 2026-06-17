ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS whatsapp_key JSONB;

DROP POLICY IF EXISTS "Users manage own messages" ON public.messages;
CREATE POLICY "Users manage own messages" ON public.messages
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
