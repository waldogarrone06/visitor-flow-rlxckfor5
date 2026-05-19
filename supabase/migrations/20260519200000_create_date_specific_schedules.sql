CREATE TABLE IF NOT EXISTS public.date_specific_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  specific_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  slot_type TEXT NOT NULL DEFAULT 'Prescritor Exclusivo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.date_specific_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can view date specific schedules" ON public.date_specific_schedules;
CREATE POLICY "Anon can view date specific schedules" ON public.date_specific_schedules
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Users manage own date specific schedules" ON public.date_specific_schedules;
CREATE POLICY "Users manage own date specific schedules" ON public.date_specific_schedules
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
