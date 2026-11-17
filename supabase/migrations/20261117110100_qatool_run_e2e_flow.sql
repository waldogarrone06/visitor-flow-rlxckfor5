-- [QA E2E] Fluxo completo de teste de agendamento público, em UMA migration
-- (contexto de escrita — db_query é read-only). Ferramenta TEMPORÁRIA de teste:
-- tudo aqui é apagado na limpeza (20261117qatool_drop_qa_helpers.sql).
--
-- O que esta migration faz, na ordem do pedido:
--  1) Dispara POST HTTP REAL na edge function create-booking (pg_net), payload
--     idêntico ao do front público — nome "TESTE QA Agendamento", telefone de
--     teste 5500000000000, e-mail destinatário = caixa própria do negócio
--     contato@fourlabnutrition.com.br, consentimento LGPD = true.
--  2) Coleta a resposta HTTP da function (aguardando até 30s) e registra em
--     public.qa_test_log para conferência posterior (meetLink, emailSent,
--     calendarWarning, contactId).
--  3) Executa a 2ª passada com o MESMO telefone (duplicação de contato?).
--  4) Executa a RPC book_appointment (service role, como o create-booking faz)
--    10 vezes mais no MESMO slot — nomes "TESTE QA Capacidade 1..10" — e depois
--    uma 11ª, que DEVE ser recusada por capacidade (409).

-- Tabela de log do teste (TEMPORÁRIA).
CREATE TABLE IF NOT EXISTS public.qa_test_log (
  id serial PRIMARY KEY,
  step text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  v_req1 bigint;
  v_req2 bigint;
  v_resp jsonb;
  v_contact1 text;
  v_contact2 text;
  v_ok boolean;
  v_user uuid := '1210e006-fbee-4c23-b7da-33e85e7703e0'::uuid;
  v_date date := '2026-11-18';
  v_time text := '08:00';
  v_appt record;
  v_capacity_err text;
  v_ate int := 0;
  v_slept int;
BEGIN
  -- Limpa resquícios de execuções anteriores deste teste (idempotência).
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
    jsonb_build_object('Content-Type', 'application/json')
  );

  v_resp := NULL;
  FOR v_slept IN 1..60 LOOP
    PERFORM pg_sleep(0.5);
    SELECT status_code, content INTO v_resp
    FROM net._http_response WHERE id = v_req1;
    EXIT WHEN v_resp IS NOT NULL;
  END LOOP;
  IF v_resp IS NULL THEN
    INSERT INTO public.qa_test_log (step, detail)
    VALUES ('passo1_create_booking', jsonb_build_object('erro', 'timeout sem resposta do pg_net'));
  ELSE
    INSERT INTO public.qa_test_log (step, detail)
    VALUES ('passo1_create_booking', v_resp);
    v_ok := ((v_resp->>'status_code')::int = 200);
    IF v_ok THEN
      v_contact1 := v_resp->'body'->>'contactId';
    END IF;
  END IF;

  -- ---------- Passo 4 (2ª passada, mesmo telefone) --------------------------
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
    jsonb_build_object('Content-Type', 'application/json')
  );

  v_resp := NULL;
  FOR v_slept IN 1..60 LOOP
    PERFORM pg_sleep(0.5);
    SELECT status_code, content INTO v_resp
    FROM net._http_response WHERE id = v_req2;
    EXIT WHEN v_resp IS NOT NULL;
  END LOOP;
  IF v_resp IS NULL THEN
    INSERT INTO public.qa_test_log (step, detail)
    VALUES ('passo4_segunda_passada', jsonb_build_object('erro', 'timeout sem resposta do pg_net'));
  ELSE
    INSERT INTO public.qa_test_log (step, detail)
    VALUES ('passo4_segunda_passada', v_resp);
    v_contact2 := v_resp->'body'->>'contactId';
  END IF;

  -- Julgamento da duplicação de contato.
  INSERT INTO public.qa_test_log (step, detail) VALUES (
    'passo4_julgamento',
    jsonb_build_object(
      'contactId_1', v_contact1,
      'contactId_2', v_contact2,
      'sem_duplicacao', (v_contact1 IS NOT NULL AND v_contact1 = v_contact2),
      'contatos_com_telefone_teste',
      (SELECT count(*) FROM public.contacts WHERE phone = '5500000000000')
    )
  );

  -- ---------- Passo 5: stress de capacidade no MESMO slot -------------------
  -- Quantos agendamentos ativos o slot já tem (reais ou da passada 1).
  SELECT count(*) INTO v_ate
  FROM public.appointments
  WHERE user_id = v_user AND appointment_date = v_date AND start_time = v_time
    AND (lower(status) IN ('lead','scheduled') OR status IS NULL);

  INSERT INTO public.qa_test_log (step, detail) VALUES (
    'passo5_slot_antes',
    jsonb_build_object('ativos_no_slot', v_ate)
  );

  v_capacity_err := NULL;
  WHILE v_ate < 10 LOOP
    v_ate := v_ate + 1;
    BEGIN
      SELECT * INTO v_appt FROM public.book_appointment(
        p_user_id => v_user,
        p_appointment_date => v_date,
        p_start_time => v_time,
        p_end_time => '08:30',
        p_status => 'scheduled',
        p_client_name => 'TESTE QA Capacidade ' || v_ate,
        p_client_email => 'contato@fourlabnutrition.com.br',
        p_client_phone => '55119000000' || lpad(v_ate::text, 2, '0'),
        p_max_capacity => 10,
        p_lgpd_consent_at => NULL
      );
      INSERT INTO public.qa_test_log (step, detail) VALUES (
        'passo5_inserido',
        jsonb_build_object('n', v_ate, 'appointment_id', v_appt.id)
      );
    EXCEPTION WHEN OTHERS THEN
      v_capacity_err := SQLERRM;
      INSERT INTO public.qa_test_log (step, detail) VALUES (
        'passo5_excecao',
        jsonb_build_object('n', v_ate, 'erro', SQLERRM, 'errcode', SQLSTATE)
      );
      EXIT;
    END;
  END LOOP;

  -- A 11ª tentativa DEVE falhar com CAPACITY_EXCEEDED.
  BEGIN
    SELECT * INTO v_appt FROM public.book_appointment(
      p_user_id => v_user,
      p_appointment_date => v_date,
      p_start_time => v_time,
      p_end_time => '08:30',
      p_status => 'scheduled',
      p_client_name => 'TESTE QA Capacidade 11',
      p_client_email => 'contato@fourlabnutrition.com.br',
      p_client_phone => '5511900000011',
      p_max_capacity => 10,
      p_lgpd_consent_at => NULL
    );
    INSERT INTO public.qa_test_log (step, detail) VALUES (
      'passo5_11a_inserida_BUG',
      jsonb_build_object('appointment_id', v_appt.id)
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.qa_test_log (step, detail) VALUES (
      'passo5_11a_recusada',
      jsonb_build_object('erro', SQLERRM, 'errcode', SQLSTATE)
    );
  END;

  -- Estado final do slot.
  SELECT count(*) INTO v_ate
  FROM public.appointments
  WHERE user_id = v_user AND appointment_date = v_date AND start_time = v_time
    AND (lower(status) IN ('lead','scheduled') OR status IS NULL);
  INSERT INTO public.qa_test_log (step, detail) VALUES (
    'passo5_slot_depois',
    jsonb_build_object('ativos_no_slot', v_ate)
  );
END $$;
