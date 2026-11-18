-- ============================================================
-- Remarcar visita por CPF (patch sobre a v12, adaptado a esta base)
-- 1) Colunas de remarcação em appointments
-- 2) cpf_digits (idempotente — usada pela unificação de CPFs duplicados)
-- 3) visit_eligibility: regras de remarcação por CPF
-- 4) find_contact_by_cpf: contato único por CPF (por profissional)
-- 5) reschedule_appointment: UPDATE da MESMA visita (lock por CPF)
-- 6) book_appointment_guarded: book_appointment + guarda de CPF
-- Padrão do projeto: SECURITY DEFINER, EXECUTE restrito a service_role.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Colunas de remarcação
-- ------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS rescheduled_at timestamptz;

-- ------------------------------------------------------------
-- 2) cpf_digits: só dígitos, 11 posições. Retorna NULL para
--    lixo/vazio. Sentinela (000.000.000-00) e dígitos repetidos
--    são FILTRADOS pelos chamadores (elas nunca casam com um CPF
--    real válido por acaso, mas as consultas ignoram-nas à parte).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cpf_digits(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_raw IS NULL THEN NULL
    WHEN length(btrim(regexp_replace(p_raw, '\D', '', 'g'))) <> 11 THEN NULL
    ELSE btrim(regexp_replace(p_raw, '\D', '', 'g'))
  END
$$;

-- ------------------------------------------------------------
-- Constantes de regra (replicadas no texto para leitura humana):
--   * linha "só de kit": start_time = end_time = '00:00'  → não é visita
--   * captura de lead:   appointment_date = 1970-01-01    → não é visita
--   * visita realizada:  status in (realizada, realizado, completed, concluida,
--                        concluída, concluído, done, attended)
--   * janela de bloqueio: 30 dias desde a última visita realizada
--   * limite: a 5ª remarcação da mesma visita é bloqueada
--     (reschedule_count >= 4 → pedir para falar com o representante)
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3) visit_eligibility — o que a rota /remarcar faz com um CPF
--    action:
--      'reschedule' → há visita em aberto (futura) ou passada NÃO
--                     realizada: remarca a MESMA linha (UPDATE)
--      'blocked'    → visitou há < 30 dias; releaseDate = data que libera
--      'new'        → visitou há >= 30 dias: nova visita, contato
--                     reaproveitado pelo CPF
--      'normal'     → sem visita: agendamento normal
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.visit_eligibility(
  p_user_id uuid,
  p_cpf text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_row public.appointments;
BEGIN
  v_digits := public.cpf_digits(p_cpf);
  IF v_digits IS NULL THEN
    RETURN jsonb_build_object('action', 'normal', 'reason', 'cpf_invalid');
  END IF;

  -- 1) Visita futura em aberto OU passada não realizada → remarca a mesma.
  --    (status lead/scheduled ainda não virou "realizada"; cancelada ignora)
  SELECT * INTO v_row
  FROM public.appointments a
  WHERE a.user_id = p_user_id
    AND public.cpf_digits(a.client_document) = v_digits
    AND a.appointment_date <> DATE '1970-01-01'
    AND NOT (coalesce(a.start_time, '') = '00:00' AND coalesce(a.end_time, '') = '00:00')
    AND lower(coalesce(a.status, '')) NOT LIKE 'cancel%'
    AND (a.status IS NULL OR lower(a.status) IN ('lead', 'scheduled'))
  ORDER BY (a.appointment_date >= v_today) DESC NULLS LAST,
           a.appointment_date DESC,
           a.created_at DESC
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'reschedule',
      'canReschedule', v_row.reschedule_count < 4,
      'rescheduleCount', v_row.reschedule_count,
      'appointment', to_jsonb(v_row)
    );
  END IF;

  -- 2) Última visita REALIZADA: < 30 dias bloqueia; >= 30 dias libera nova.
  SELECT * INTO v_row
  FROM public.appointments a
  WHERE a.user_id = p_user_id
    AND public.cpf_digits(a.client_document) = v_digits
    AND a.appointment_date < v_today
    AND a.appointment_date <> DATE '1970-01-01'
    AND NOT (coalesce(a.start_time, '') = '00:00' AND coalesce(a.end_time, '') = '00:00')
    AND lower(coalesce(a.status, '')) IN (
      'realizada', 'realizado', 'completed', 'concluida', 'concluída',
      'concluído', 'done', 'attended'
    )
  ORDER BY a.appointment_date DESC, a.created_at DESC
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    IF v_row.appointment_date >= v_today - 30 THEN
      RETURN jsonb_build_object(
        'action', 'blocked',
        'lastVisitDate', v_row.appointment_date,
        'releaseDate', v_row.appointment_date + 30
      );
    END IF;
    RETURN jsonb_build_object('action', 'new');
  END IF;

  RETURN jsonb_build_object('action', 'normal');
END;
$$;

-- ------------------------------------------------------------
-- 4) find_contact_by_cpf — o contato é ÚNICO por CPF (por
--    profissional). Usado pelo create-booking antes de casar por
--    telefone/e-mail, para não criar contato duplicado por CPF.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_contact_by_cpf(
  p_user_id uuid,
  p_cpf text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.contacts;
BEGIN
  SELECT * INTO v_c
  FROM public.contacts c
  WHERE c.user_id = p_user_id
    AND public.cpf_digits(c.document) = public.cpf_digits(p_cpf)
  ORDER BY c.created_at ASC
  LIMIT 1;
  RETURN to_jsonb(v_c);
END;
$$;

-- ------------------------------------------------------------
-- 5) reschedule_appointment — UPDATE da MESMA visita.
--    Escreve APENAS: data, início, fim, status, reschedule_count,
--    rescheduled_at, reminder_sent, prescriber_notified.
--    NÃO toca em kit_*, tracking_number, cupons, delivered_at nem
--    dados pessoais — as triggers de kit são UPDATE OF
--    kit_status/tracking_number e não disparam.
--    Lock por CPF (advisory) → duas requisições simultâneas não
--    criam duas visitas nem remarcam duas vezes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_user_id uuid,
  p_appointment_id uuid,
  p_cpf text,
  p_new_date date,
  p_new_start text,
  p_new_end text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text;
  v_row public.appointments;
  v_count integer;
  v_max constant integer := 10;   -- mesma capacidade do book_appointment
  v_max_reschedules constant integer := 4;  -- a 5ª remarcação é bloqueada
BEGIN
  v_digits := public.cpf_digits(p_cpf);
  IF v_digits IS NULL THEN
    RAISE EXCEPTION 'CPF_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Lock transacional por CPF: serializa remarcações/criações do mesmo CPF
  PERFORM pg_advisory_xact_lock(hashtext('cpf:' || p_user_id::text || ':' || v_digits));

  SELECT * INTO v_row
  FROM public.appointments
  WHERE id = p_appointment_id
    AND user_id = p_user_id
    AND public.cpf_digits(client_document) = v_digits
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VISIT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Linhas "só de kit" e capturas de lead NÃO são visitas
  IF v_row.appointment_date = DATE '1970-01-01'
     OR (coalesce(v_row.start_time, '') = '00:00' AND coalesce(v_row.end_time, '') = '00:00') THEN
    RAISE EXCEPTION 'NOT_A_VISIT' USING ERRCODE = 'P0001';
  END IF;

  IF lower(coalesce(v_row.status, '')) LIKE 'cancel%' THEN
    RAISE EXCEPTION 'VISIT_CANCELLED' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.reschedule_count >= v_max_reschedules THEN
    RAISE EXCEPTION 'RESCHEDULE_LIMIT' USING ERRCODE = 'P0001';
  END IF;

  -- Capacidade no NOVO slot (chave = slot COMPLETO data+start+end),
  -- excluindo a própria linha que está sendo movida.
  SELECT count(*) INTO v_count
  FROM public.appointments
  WHERE user_id = p_user_id
    AND appointment_date = p_new_date
    AND start_time = p_new_start
    AND end_time IS NOT DISTINCT FROM p_new_end
    AND id <> p_appointment_id
    AND (status IS NULL OR lower(status) IN ('lead', 'scheduled'));

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'CAPACITY_EXCEEDED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.appointments SET
    appointment_date   = p_new_date,
    start_time         = p_new_start,
    end_time           = p_new_end,
    status             = 'scheduled',
    reschedule_count   = reschedule_count + 1,
    rescheduled_at     = now(),
    reminder_sent      = false,
    prescriber_notified = false
  WHERE id = p_appointment_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('appointment', to_jsonb(v_row));
END;
$$;

-- ------------------------------------------------------------
-- 6) book_appointment_guarded — MESMOS parâmetros do
--    book_appointment (p_lgpd_consent_at por último), com a guarda
--    de CPF ANTES de inserir. A captura de lead (1970-01-01) passa
--    direto, fora da guarda. Delega a inserção à book_appointment
--    (capacidade 10, lock de slot) — nenhuma regra duplicada.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.book_appointment_guarded(
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
  p_max_capacity integer DEFAULT 10,
  p_lgpd_consent_at timestamptz DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits text;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_release date;
BEGIN
  -- Guarda de CPF: só para visita REAL (captura de lead 1970-01-01 passa).
  IF p_appointment_date IS NOT NULL AND p_appointment_date <> DATE '1970-01-01' THEN
    v_digits := public.cpf_digits(p_client_document);
    IF v_digits IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('cpf:' || p_user_id::text || ':' || v_digits));

      -- Visita futura em aberto OU passada não realizada: NÃO cria linha
      -- nova — o visitante deve remarcar a existente.
      IF EXISTS (
        SELECT 1
        FROM public.appointments a
        WHERE a.user_id = p_user_id
          AND public.cpf_digits(a.client_document) = v_digits
          AND a.appointment_date <> DATE '1970-01-01'
          AND NOT (coalesce(a.start_time, '') = '00:00' AND coalesce(a.end_time, '') = '00:00')
          AND lower(coalesce(a.status, '')) NOT LIKE 'cancel%'
          AND (a.status IS NULL OR lower(a.status) IN ('lead', 'scheduled'))
      ) THEN
        RAISE EXCEPTION 'CPF_HAS_OPEN_VISIT' USING ERRCODE = 'P0001';
      END IF;

      -- Visitou há < 30 dias: bloqueado até data + 30
      SELECT a.appointment_date INTO v_release
      FROM public.appointments a
      WHERE a.user_id = p_user_id
        AND public.cpf_digits(a.client_document) = v_digits
        AND a.appointment_date < v_today
        AND a.appointment_date <> DATE '1970-01-01'
        AND NOT (coalesce(a.start_time, '') = '00:00' AND coalesce(a.end_time, '') = '00:00')
        AND lower(coalesce(a.status, '')) IN (
          'realizada', 'realizado', 'completed', 'concluida', 'concluída',
          'concluído', 'done', 'attended'
        )
      ORDER BY a.appointment_date DESC
      LIMIT 1;

      IF v_release IS NOT NULL AND v_release >= v_today - 30 THEN
        RAISE EXCEPTION 'CPF_BLOCKED_30D:%', to_char(v_release + 30, 'DD/MM/YYYY')
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN public.book_appointment(
    p_user_id, p_appointment_date, p_start_time, p_end_time, p_status,
    p_client_name, p_client_email, p_client_phone, p_client_document,
    p_specialty, p_professional_id, p_clinic_cep, p_clinic_address,
    p_clinic_number, p_clinic_neighborhood, p_clinic_complement,
    p_clinic_city, p_clinic_state, p_instagram, p_patients_per_month,
    p_max_capacity, p_lgpd_consent_at
  );
END;
$$;

-- ------------------------------------------------------------
-- Grants: RPCs novas só para o service_role (edge functions).
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.visit_eligibility(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_contact_by_cpf(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_appointment(uuid, uuid, text, date, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.book_appointment_guarded(uuid, date, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, integer, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.visit_eligibility(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_contact_by_cpf(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(uuid, uuid, text, date, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.book_appointment_guarded(uuid, date, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, integer, timestamptz) TO service_role;
