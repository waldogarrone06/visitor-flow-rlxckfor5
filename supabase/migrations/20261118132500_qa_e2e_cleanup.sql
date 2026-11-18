-- Limpeza de resíduos QA E2E (data-only, idempotente, sem DDL).
-- Escopo EXCLUSIVAMENTE dos dados criados pelos testes E2E de agendamento:
--   - agendamentos de teste: client_name LIKE 'TESTE QA%'
--   - contatos de teste: name LIKE 'TESTE QA%' OU phone em (11999990001/2 e variantes 55…)
--   - rate_limit_events criados pelas rodadas de teste (janela 2026-11-18T12:00Z → 13:30Z)
-- Nada de negócio é tocado. Idempotente: reexecutar não faz nada (DELETE de linhas inexistentes).
DELETE FROM public.appointments WHERE client_name LIKE 'TESTE QA%';

DELETE FROM public.contacts
WHERE name LIKE 'TESTE QA%'
   OR phone IN ('11999990001','5511999990001','11999990002','5511999990002');

DELETE FROM public.rate_limit_events
WHERE created_at BETWEEN '2026-11-18T12:00:00Z' AND '2026-11-18T13:30:00Z';

-- Log de interação usado apenas para persistir o relatório do teste E2E.
DELETE FROM public.interaction_log
WHERE type IN ('qa_e2e_booking_v6', 'qa_e2e_booking_v6b');
