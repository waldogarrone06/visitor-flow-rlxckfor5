CREATE TABLE IF NOT EXISTS public.whatsapp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance TEXT NOT NULL,
  remote_jid TEXT NOT NULL,
  message_type TEXT NOT NULL,
  message JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.interaction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.session_state (
  phone TEXT PRIMARY KEY,
  current_step TEXT,
  context JSONB,
  last_interaction TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.whatsapp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaction_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_state ENABLE ROW LEVEL SECURITY;

-- Adicionar Políticas de Segurança
DROP POLICY IF EXISTS "whatsapp_events_all" ON public.whatsapp_events;
CREATE POLICY "whatsapp_events_all" ON public.whatsapp_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "interaction_log_all" ON public.interaction_log;
CREATE POLICY "interaction_log_all" ON public.interaction_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "session_state_all" ON public.session_state;
CREATE POLICY "session_state_all" ON public.session_state FOR ALL TO authenticated USING (true) WITH CHECK (true);
