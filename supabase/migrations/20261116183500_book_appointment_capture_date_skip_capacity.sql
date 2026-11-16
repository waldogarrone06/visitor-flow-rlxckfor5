-- Corretiva da 20261116183000: a checagem de capacidade por slot não deve se
-- aplicar à data sentinela de captura de contatos (1970-01-01, start 00:00) —
-- todos os leads de captura gravam nela e o 11º seria rejeitado. A exceção é
-- decidida AQUI dentro da RPC (o cliente não controla capacidade).

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
RETURNS appointments
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
  v_new public.appointments;
BEGIN
  -- Só a service role (edge functions) pode executar a RPC direto.
  IF current_setting('role') NOT IN ('service_role') THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas o servidor pode agendar'
      USING ERRCODE = '42501';
  END IF;

  -- Valores canônicos
  p_status := lower(coalesce(nullif(trim(p_status), ''), 'lead'));

  IF p_appointment_date <> v_capture_date THEN
    -- Lock transacional por slot (serializa concorrência no mesmo slot)
    v_slot_key := concat_ws(':', p_user_id::text, p_appointment_date::text, p_start_time);
    PERFORM pg_advisory_xact_lock(hashtext(v_slot_key));

    -- Contagem de agendamentos ativos (lead + scheduled) no slot
    SELECT count(*) INTO v_count
    FROM public.appointments
    WHERE user_id = p_user_id
      AND appointment_date = p_appointment_date
      AND start_time = p_start_time
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
    lgpd_consent_at
  ) VALUES (
    p_user_id,
    p_client_name,
    p_client_email,
    p_client_phone,
    p_client_document,
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
    p_lgpd_consent_at
  )
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;
