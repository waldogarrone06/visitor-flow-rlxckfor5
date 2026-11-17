-- Auditoria de segurança: a policy "Auth can insert appointments" em
-- public.appointments tinha WITH CHECK (true) — qualquer usuário autenticado
-- podia inserir um agendamento em nome de OUTRO user_id. Passa a exigir que o
-- user_id inserido seja o do próprio usuário (auth.uid() = user_id).
--
-- Fluxos verificados:
-- - Formulário PÚBLICO não insere direto: passa pela edge function
--   create-booking com a service role, que IGNORA RLS — não afetado.
-- - KitBuilder (solicitação de kit) insere direto com user_id = user.id —
--   segue funcionando, pois o user_id é o próprio usuário.
DROP POLICY IF EXISTS "Auth can insert appointments" ON public.appointments;

CREATE POLICY "Auth can insert appointments" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
