-- [LIMPEZA QA] Remove os artefatos temporários de teste E2E criados pelas
-- migrations qatool_* (20261117110000..20261117110400), que já cumpriram seu
-- papel e foram apontadas pelo auditor como risco:
--   - functions qa_http_create_booking / qa_http_get_response / qa_http_pending
--     (wrappers pg_net de reserva HTTP automática)
--   - function qa_read_results (SECURITY DEFINER, leitura do log de teste)
--   - tabela qa_test_log
-- Migration idempotente: em banco novo sem os objetos, nada é alterado.
-- As migrations qatool_* antigas NÃO são editadas (histórico aplicado).

-- Cinto e suspensório: antes do DROP, revoga todo EXECUTE das functions qa_*
-- (qa_http_* ainda tinha EXECUTE para PUBLIC/anon/authenticated no catálogo).
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'qa\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC', fn.proname);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM anon', fn.proname);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM authenticated', fn.proname);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.qa_read_results();
DROP FUNCTION IF EXISTS public.qa_http_pending();
DROP FUNCTION IF EXISTS public.qa_http_get_response(bigint);
DROP FUNCTION IF EXISTS public.qa_http_create_booking();

DROP TABLE IF EXISTS public.qa_test_log CASCADE;
