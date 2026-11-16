-- Fecha as policies de SELECT anônimo que expõem PII (appointments, contacts).
-- O formulário público de captura de leads e o agendamento público continuam
-- funcionando: apenas INSERTs anônimos permanecem permitidos.
-- Nenhum dado é destruído — apenas policies (DROP/CREATE).

-- 1) appointments: remove a leitura anônima total (exposição de nome, e-mail,
--    telefone e CPF). A leitura do Google Meet pela página pública de agendamento
--    continua disponível através da SECURITY DEFINER get_appointment_meet_link(uuid)
--    e a disponibilidade de horários segue pela edge function check-availability.
DROP POLICY IF EXISTS "Anon can view appointments for capacity" ON public.appointments;

-- 2) contacts: idem — nenhum SELECT anônimo deve retornar PII.
DROP POLICY IF EXISTS "Anon can view contacts for duplicate check" ON public.contacts;
DROP POLICY IF EXISTS "Anon can view contacts" ON public.contacts;

-- 3) Garante que os INSERTs anônimos que os formulários públicos precisam continuam de pé.
--    (Idempotente: recria apenas se não existirem.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'appointments'
      AND policyname = 'Anon can insert appointments'
  ) THEN
    CREATE POLICY "Anon can insert appointments" ON public.appointments
      FOR INSERT TO anon
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contacts'
      AND policyname = 'Anon can insert contacts'
  ) THEN
    CREATE POLICY "Anon can insert contacts" ON public.contacts
      FOR INSERT TO anon
      WITH CHECK (true);
  END IF;
END $$;
