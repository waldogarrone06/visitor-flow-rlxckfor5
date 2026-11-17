-- Corretiva da trava de capacidade da book_appointment (E2E v0.0.431: 5ª
-- reserva no slot 09:30 recebeu 409 com v_max = 10).
--
-- Causa comprovada no corpo ao vivo (pg_get_functiondef): a contagem era por
-- (user_id, appointment_date, start_time) SEM end_time — dois slots distintos
-- que compartilham o mesmo start_time (ex.: 09:30-10:00 e 09:30-10:30) contam
-- juntos, esgotando a capacidade antes da hora. A lock key (concat_ws) também
-- omitia end_time.
--
-- Esta migration deixa a contagem EXCLUSIVA do slot completo (user_id + date +
-- start_time + end_time), mantendo intactos: v_max = 10 (constante do
-- servidor), lock transacional por slot, exceção da data sentinela 1970-01-01
-- (captura de leads fora da trava), filtro de status ativo (lead/scheduled/NULL)
-- e gravação do consentimento LGPD pelo servidor (now() + versão 'v1').

CREATE OR REPLACE FUNCTION public.book_appointment(
  p_user_id uuid,
  p_appointment_date date,
  p_start_time text,
  p_end_time text,
  p_status text,
  p_client_name text DEFAULT NULL,
  p_client_email text DEFAULT NULL,
  p_client_phone text DEFAULT NULL,
  p_client_document text DEFAULT NULL,
  p_specialty text DEFAULT NULL,
  p_professional_id text DEFAULT NULL,
  p_clinic_cep text DEFAULT NULL,
  p_clinic_address text DEFAULT NULL,
  p_clinic_number text DEFAULT NULL,
  p_clinic_neighborhood text DEFAULT NULL,
  p_clinic_complement text DEFAULT NULL,
  p_clinic_city text DEFAULT NULL,
  p_clinic_state text DEFAULT NULL,
  p_instagram text DEFAULT NULL,
  p_patients_per_month text DEFAULT NULL,
  p_appointment_type text DEFAULT NULL,
  p_max_capacity integer DEFAULT 10,
  p_lgpd_consent_at timestamptz DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_slot_key text;
  v_count integer;
  -- Capacidade máxima por slot é decisão do SERVIDOR: constante fixa aqui dentro.
  v_max constant integer := 10;
  -- Data sentinela usada APENAS pela captura de contatos (LeadCapture):
  -- não representa um slot real, logo fica fora da trava de capacidade.
  v_capture_date constant date := '1970-01-01';
  -- Versão do termo LGPD vigente — fato do SERVIDOR, nunca do cliente.
  v_term_version constant text := 'v1';
  v_new public.appointments;
BEGIN
  -- Só a service role (edge functions) pode executar a RPC direto.
  IF current_setting('role') NOT IN ('service_role') THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas o servidor pode agendar'
      USING ERRCODE = '42501';
  END IF;

  -- Valores canônicos: status em minúsculo, default 'lead';
  -- NOT NULL sem default no banco recebem '' quando ausentes.
  p_status := lower(coalesce(nullif(trim(p_status), ''), 'lead'));

  IF p_appointment_date <> v_capture_date THEN
    -- Lock transacional POR SLOT COMPLETO (serializa concorrência no mesmo
    -- slot): user_id + date + start_time + end_time. concat_ws não é usado
    -- porque descarta partes nulas — os 4 componentes são sempre não nulos
    -- aqui (p_end_time chega do create-booking como startTime no pior caso).
    v_slot_key := p_user_id::text || ':' || p_appointment_date::text || ':' ||
                  p_start_time || ':' || p_end_time;
    PERFORM pg_advisory_xact_lock(hashtext(v_slot_key));

    -- Contagem de agendamentos ativos (lead + scheduled) no MESMO SLOT COMPLETO:
    -- mesmo user_id, mesma date, mesmo start_time E mesmo end_time.
    SELECT count(*) INTO v_count
    FROM public.appointments
    WHERE user_id = p_user_id
      AND appointment_date = p_appointment_date
      AND start_time = p_start_time
      AND end_time = p_end_time
      AND (lower(status) IN ('lead', 'scheduled') OR status IS NULL);

    IF v_count >= v_max THEN
      RAISE EXCEPTION 'CAPACITY_EXCEEDED: este horário já atingiu o limite de % agendamentos', v_max
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.appointments (
    user_id,
    client_name,
    client_email,
    client_phone,
    client_document,
    appointment_date,
    start_time,
    end_time,
    status,
    specialty,
    professional_id,
    clinic_cep,
    clinic_address,
    clinic_number,
    clinic_neighborhood,
    clinic_complement,
    clinic_city,
    clinic_state,
    instagram,
    patients_per_month,
    lgpd_consent_at,
    lgpd_consent_term_version
  ) VALUES (
    p_user_id,
    p_client_name,
    coalesce(p_client_email, ''),
    p_client_phone,
    coalesce(p_client_document, ''),
    p_appointment_date,
    p_start_time,
    p_end_time,
    p_status,
    p_specialty,
    p_professional_id,
    p_clinic_cep,
    p_clinic_address,
    p_clinic_number,
    p_clinic_neighborhood,
    p_clinic_complement,
    p_clinic_city,
    p_clinic_state,
    p_instagram,
    p_patients_per_month,
    -- LGPD: quando e versão do termo são gravados PELO SERVIDOR. O timestamp
    -- enviado pelo cliente (p_lgpd_consent_at) é deliberadamente ignorado.
    now(),
    v_term_version
  )
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;

-- Execução continua restrita à service role (idempotente com a hardening).
REVOKE ALL ON FUNCTION public.book_appointment(uuid, date, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment(uuid, date, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, integer, timestamptz) TO service_role;
