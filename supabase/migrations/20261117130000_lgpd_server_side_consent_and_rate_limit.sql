-- Rodada auditor 2026-11-17 (3 itens):
-- 1) Consentimento LGPD vira FATO DO SERVIDOR: coluna nova de versão do termo
--    e RPC book_appointment gravando now() do banco (ignora o valor do cliente).
-- 2) Rate limiting do fluxo público: tabela de eventos usada pelas edge
--    functions create-booking e get-availability (service role, sem Redis).
-- 3) RLS habilitada na tabela nova (sem policies: anônimo/authenticado não
--    leem nem escrevem; só a service role das edge functions acessa).

-- ---------------------------------------------------------------------------
-- 1) Versão do termo de consentimento
-- ---------------------------------------------------------------------------
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS lgpd_consent_term_version text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS lgpd_consent_term_version text;

-- Backfill: quem já tem consentimento gravado ficou sob o termo vigente (v1).
UPDATE public.appointments
SET lgpd_consent_term_version = 'v1'
WHERE lgpd_consent_at IS NOT NULL AND lgpd_consent_term_version IS NULL;

UPDATE public.contacts
SET lgpd_consent_term_version = 'v1'
WHERE lgpd_consent_at IS NOT NULL AND lgpd_consent_term_version IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Rate limit (janela simples persistida — não há Redis neste projeto)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_bucket_created_at
  ON public.rate_limit_events (bucket, created_at);

-- Sem policies de propósito: RLS bloqueia anon/authenticated; as edge
-- functions usam a service role, que ignora RLS.
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) RPC book_appointment: consentimento gravado PELO SERVIDOR
--    - p_lgpd_consent_at continua na assinatura por compatibilidade, mas é
--      IGNORADO: o valor gravado é sempre now() do banco.
--    - lgpd_consent_term_version é constante do servidor ('v1').
--    - Capacidade 10, data sentinela 1970-01-01 e restrição a service_role
--      permanecem como nas migrations anteriores.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 4) Limpeza da tabela de rate limit: a poda probabilística (~5% das chamadas)
--    nas edge functions já mantém a tabela pequena em tráfego normal. Um job
--    pg_cron de DELETE não foi criado aqui porque http_delete exigiria a chave
--    de service role em texto claro dentro do cron — migrations futuras podem
--    criar um job direto de DELETE na tabela se o tráfego crescer.
-- ---------------------------------------------------------------------------
