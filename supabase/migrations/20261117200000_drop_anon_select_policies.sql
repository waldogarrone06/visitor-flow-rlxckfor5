-- Fechamento da leitura anônima de agendas (auditoria).
--
-- As 3 policies anônimas de SELECT (USING true) deixam de existir: desde a
-- edge function get-availability (service role), o fluxo PÚBLICO de
-- agendamento não lê mais schedule_settings, date_specific_schedules nem
-- locked_slots direto pela API REST — grepes confirmaram zero referências no
-- front a essas tabelas fora de src/services/settings.ts, que exige sessão
-- (getSchedule/getSpecificSchedule checam user antes de consultar) e por isso
-- segue coberto pelas policies de authenticated.
--
-- As policies de authenticated (user_id = auth.uid()) NÃO são tocadas.

DROP POLICY IF EXISTS "Anon can view schedules" ON public.schedule_settings;
DROP POLICY IF EXISTS "Anon can view date specific schedules" ON public.date_specific_schedules;
DROP POLICY IF EXISTS "Anon can view locked slots" ON public.locked_slots;

-- Defesa em profundidade: sem grant de SELECT, o anon não lê nada nessas
-- tabelas mesmo que uma policy futura volte a existir.
REVOKE SELECT ON public.schedule_settings FROM anon;
REVOKE SELECT ON public.date_specific_schedules FROM anon;
REVOKE SELECT ON public.locked_slots FROM anon;
