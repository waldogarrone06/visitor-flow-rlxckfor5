-- [QA E2E] Ferramenta TEMPORÁRIA de teste: wrapper pg_net para invocar a edge
-- function create-booking como o front faria (HTTP real, POST).
-- SERÁ APAGADA na limpeza (20261117qatool_drop_qa_helpers.sql).

CREATE OR REPLACE FUNCTION public.qa_http_create_booking() RETURNS bigint
LANGUAGE plpgsql AS $$
BEGIN
  RETURN net.http_post(
    'https://zbtaxosxmxoidrtmojfx.supabase.co/functions/v1/create-booking',
    jsonb_build_object(
      'userId', '1210e006-fbee-4c23-b7da-33e85e7703e0',
      'appointmentDate', '2026-11-18',
      'startTime', '08:00',
      'clientName', 'TESTE QA Agendamento',
      'clientEmail', 'contato@fourlabnutrition.com.br',
      'clientPhone', '5500000000000',
      'lgpdConsent', true,
      'createCalendar', true,
      'sendConfirmationEmail', true
    ),
    '{}'::jsonb,
    jsonb_build_object('Content-Type', 'application/json')
  );
END;
$$;

-- Consulta a resposta coletada pelo pg_net de um request já disparado.
CREATE OR REPLACE FUNCTION public.qa_http_get_response(p_request bigint)
RETURNS TABLE (status_code int, content_type text, body text)
LANGUAGE sql AS $$
  SELECT r.status_code, r.content_type, r.content
  FROM net._http_response r WHERE r.id = p_request
$$;

-- Diagnóstico da fila/respostas do pg_net.
CREATE OR REPLACE FUNCTION public.qa_http_pending() RETURNS TABLE (pending bigint, delivered bigint)
LANGUAGE sql AS $$
  SELECT
    (SELECT count(*) FROM net.http_request_queue),
    (SELECT count(*) FROM net._http_response)
$$;
