-- [QA E2E] Disparo das duas reservas HTTP (create-booking) via pg_net, com
-- coleta da resposta AO FINAL da própria migration (sem pg_sleep longo —
-- a anterior estourou o statement timeout da plataforma).
-- Ferramenta TEMPORÁRIA: apagada na limpeza.

DO $$
DECLARE
  v_req1 bigint;
  v_req2 bigint;
  v_resp1 RECORD;
  v_resp2 RECORD;
  v_contact1 text;
  v_contact2 text;
  v_user uuid := '1210e006-fbee-4c23-b7da-33e85e7703e0'::uuid;
  v_date date := '2026-11-18';
  v_time text := '08:00';
  v_status1 int := 0;
  v_status2 int := 0;
  v_body1 text := NULL;
  v_body2 text := NULL;
BEGIN
  DELETE FROM public.qa_test_log;

  -- ---------- Passo 1: reserva real via create-booking (HTTP) -------------
  v_req1 := net.http_post(
    'https://zbtaxosxmxoidrtmojfx.supabase.co/functions/v1/create-booking',
    jsonb_build_object(
      'userId', v_user,
      'appointmentDate', to_char(v_date, 'YYYY-MM-DD'),
      'startTime', v_time,
      'clientName', 'TESTE QA Agendamento',
      'clientEmail', 'contato@fourlabnutrition.com.br',
      'clientPhone', '5500000000000',
      'lgpdConsent', true,
      'createCalendar', true,
      'sendConfirmationEmail', true
    ),
    '{}'::jsonb,
    jsonb_build_object('Content-Type', 'application/json'),
    60000
  );

  -- ---------- Passo 4: 2ª passada com o MESMO telefone ----------------------
  v_req2 := net.http_post(
    'https://zbtaxosxmxoidrtmojfx.supabase.co/functions/v1/create-booking',
    jsonb_build_object(
      'userId', v_user,
      'appointmentDate', to_char(v_date, 'YYYY-MM-DD'),
      'startTime', v_time,
      'clientName', 'TESTE QA Agendamento 2',
      'clientEmail', 'contato@fourlabnutrition.com.br',
      'clientPhone', '5500000000000',
      'lgpdConsent', true,
      'createCalendar', false,
      'sendConfirmationEmail', false
    ),
    '{}'::jsonb,
    jsonb_build_object('Content-Type', 'application/json'),
    60000
  );

  -- Espera CURTA e única (fora de loop com pg_sleep repetido): 8s.
  PERFORM pg_sleep(8);

  SELECT status_code, content INTO v_resp1 FROM net._http_response WHERE id = v_req1;
  SELECT status_code, content INTO v_resp2 FROM net._http_response WHERE id = v_req2;

  IF v_resp1 IS NOT NULL THEN
    v_status1 := v_resp1.status_code;
    v_body1 := v_resp1.content;
  END IF;
  IF v_resp2 IS NOT NULL THEN
    v_status2 := v_resp2.status_code;
    v_body2 := v_resp2.content;
  END IF;

  INSERT INTO public.qa_test_log (step, detail) VALUES ('passo1_resposta', jsonb_build_object(
    'status', v_status1, 'body', v_body1));

  INSERT INTO public.qa_test_log (step, detail) VALUES ('passo4_resposta', jsonb_build_object(
    'status', v_status2, 'body', v_body2));

  v_contact1 := NULLIF(v_body1, '')::jsonb->>'contactId';
  v_contact2 := NULLIF(v_body2, '')::jsonb->>'contactId';

  INSERT INTO public.qa_test_log (step, detail) VALUES ('passo4_julgamento', jsonb_build_object(
    'contactId_1', v_contact1,
    'contactId_2', v_contact2,
    'sem_duplicacao', (v_contact1 IS NOT NULL AND v_contact1 = v_contact2),
    'contatos_com_telefone_teste',
    (SELECT count(*) FROM public.contacts WHERE phone = '5500000000000')
  ));
END $$;
