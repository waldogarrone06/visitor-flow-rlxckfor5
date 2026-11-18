-- ============================================================================
-- DIAGNÓSTICO: duplicados por CPF (SOMENTE LEITURA)
-- ============================================================================
-- Este arquivo NÃO é uma migration. Não criar em supabase/migrations e não
-- rodar como parte do deploy: roda manualmente no SQL Editor contra o banco
-- de produção, um bloco por vez. Nenhuma declaração aqui modifica dados.
--
-- Requer public.cpf_digits (migration 20261118160000, já aplicada).
-- Regra de unificação (decisão da operação): NUNCA apagar a linha com kit.
-- ============================================================================


-- ============================================================================
-- BLOCO 1 — Contatos duplicados por CPF
-- Agrupa contacts por cpf_digits(document) com 11 dígitos, excluindo CPF
-- "repetido" (todos os dígitos iguais, ex. 111.111.111-11) e vazio/nulo.
-- Lista os contatos de cada CPF lado a lado: nome, telefone, e-mail, id.
-- ============================================================================
WITH cpf_contacts AS (
  SELECT
    public.cpf_digits(c.document) AS cpf,
    c.id,
    c.user_id,
    c.name,
    c.phone,
    c.email,
    c.document,
    c.created_at
  FROM public.contacts c
),
duplicated_cpfs AS (
  SELECT cpf
  FROM cpf_contacts
  WHERE cpf IS NOT NULL
    AND length(cpf) = 11
    AND cpf ~ '^(\d)\1{10}$' = false          -- exclui 11111111111, 222..., etc.
  GROUP BY cpf
  HAVING count(*) > 1
)
SELECT
  d.cpf,
  d.id AS contact_id,
  d.user_id,
  d.name,
  d.phone,
  d.email,
  d.document,
  d.created_at
FROM cpf_contacts d
JOIN duplicated_cpfs dup ON dup.cpf = d.cpf
ORDER BY d.cpf, d.created_at;


-- ============================================================================
-- BLOCO 2 — Visitas em aberto duplicadas por CPF
-- Visitas "em aberto": status lead/scheduled/rescheduled, exclui a data
-- sentinela 1970-01-01 (captura de LeadCapture) e as linhas de kit/envio
-- (00:00–00:00 sem horário real). Só CPFs que TENHAM alguma visita passada
-- com status 'visited' e mostra as em aberto com data >= essa última visita.
-- ============================================================================
WITH visits AS (
  SELECT
    public.cpf_digits(a.client_document) AS cpf,
    a.id,
    a.user_id,
    a.client_name,
    a.appointment_date,
    a.start_time,
    a.end_time,
    a.status,
    a.kit_status,
    a.created_at
  FROM public.appointments a
),
duplicated_cpfs AS (
  SELECT cpf
  FROM visits
  WHERE cpf IS NOT NULL
    AND length(cpf) = 11
    AND cpf ~ '^(\d)\1{10}$' = false
  GROUP BY cpf
  HAVING count(*) > 1
),
last_visited AS (
  SELECT cpf, max(appointment_date) AS last_visit_date
  FROM visits
  WHERE status = 'visited'
    AND cpf IS NOT NULL
    AND length(cpf) = 11
  GROUP BY cpf
)
SELECT
  v.cpf,
  v.id AS appointment_id,
  v.user_id,
  v.client_name,
  v.appointment_date,
  v.start_time,
  v.end_time,
  v.status,
  v.kit_status,
  lv.last_visit_date
FROM visits v
JOIN duplicated_cpfs dup ON dup.cpf = v.cpf
LEFT JOIN last_visited lv ON lv.cpf = v.cpf
WHERE v.status IN ('lead', 'scheduled', 'rescheduled')
  AND v.appointment_date <> DATE '1970-01-01'                    -- sentinela LeadCapture
  AND NOT (COALESCE(v.start_time, '00:00') = '00:00'
           AND COALESCE(v.end_time, '00:00') = '00:00')          -- só-de-kit (00:00–00:00)
  AND v.appointment_date >= lv.last_visit_date                   -- só após a última 'visited'
ORDER BY v.cpf, v.appointment_date, v.start_time;


-- ============================================================================
-- BLOCO 3 — Linhas dos CPFs duplicados com marcador tem_kit / tem_cupom
-- Visão completa por CPF duplicado: todas as linhas (contatos e visitas) com
-- marcadores de kit e cupom. REGRA DE UNIFICAÇÃO: NUNCA apagar a linha com
-- kit/envio — é a que preserva rastreio, cupons e histórico.
-- ============================================================================
WITH duplicated_cpfs AS (
  SELECT DISTINCT public.cpf_digits(c.document) AS cpf
  FROM public.contacts c
  WHERE public.cpf_digits(c.document) IS NOT NULL
    AND length(public.cpf_digits(c.document)) = 11
    AND public.cpf_digits(c.document) ~ '^(\d)\1{10}$' = false
  GROUP BY public.cpf_digits(c.document)
  HAVING count(*) > 1
),
contact_rows AS (
  SELECT
    public.cpf_digits(c.document) AS cpf,
    'contato' AS origem,
    c.id AS row_id,
    c.user_id,
    c.name,
    c.phone,
    c.email,
    c.created_at,
    -- Kit: contato não tem kit direto; o kit fica na visita (appointments).
    false AS tem_kit,
    -- Cupom: contato tem cupons próprios (nutricionista/paciente).
    (c.nutritionist_coupon IS NOT NULL OR c.patient_coupon IS NOT NULL) AS tem_cupom,
    c.nutritionist_coupon,
    c.patient_coupon,
    NULL::text AS kit_status,
    NULL::text AS tracking_number
  FROM public.contacts c
  JOIN duplicated_cpfs d ON d.cpf = public.cpf_digits(c.document)
),
appointment_rows AS (
  SELECT
    public.cpf_digits(a.client_document) AS cpf,
    'visita' AS origem,
    a.id AS row_id,
    a.user_id,
    a.client_name AS name,
    a.client_phone AS phone,
    a.client_email AS email,
    a.created_at,
    -- Kit/envio: presença de kit OU rastreio OU entrega OU linha só-de-kit
    -- (00:00–00:00) OU data sentinela = linha de captura com kit associado.
    (a.kit_name IS NOT NULL
     OR a.kit_status IS NOT NULL AND a.kit_status <> 'Pending'
     OR a.tracking_number IS NOT NULL
     OR a.delivered_at IS NOT NULL
     OR a.kit_requested_at IS NOT NULL
     OR (COALESCE(a.start_time, '00:00') = '00:00'
         AND COALESCE(a.end_time, '00:00') = '00:00'
         AND a.appointment_date = DATE '1970-01-01')
    ) AS tem_kit,
    (a.nutritionist_coupon IS NOT NULL OR a.patient_coupon IS NOT NULL) AS tem_cupom,
    a.nutritionist_coupon,
    a.patient_coupon,
    a.kit_status,
    a.tracking_number
  FROM public.appointments a
  JOIN duplicated_cpfs d ON d.cpf = public.cpf_digits(a.client_document)
)
SELECT
  cpf, origem, row_id, user_id, name, phone, email, created_at,
  tem_kit, tem_cupom, nutritionist_coupon, patient_coupon,
  kit_status, tracking_number,
  CASE
    WHEN tem_kit THEN 'PRESERVAR (tem kit)'
    ELSE 'candidata a unificar/apagar'
  END AS acao
FROM contact_rows
UNION ALL
SELECT
  cpf, origem, row_id, user_id, name, phone, email, created_at,
  tem_kit, tem_cupom, nutritionist_coupon, patient_coupon,
  kit_status, tracking_number,
  CASE
    WHEN tem_kit THEN 'PRESERVAR (tem kit)'
    ELSE 'candidata a unificar/apagar'
  END
FROM appointment_rows
ORDER BY cpf, origem, created_at;


-- ============================================================================
-- BLOCO 4 — Resumo geral
-- cpfs_com_contato_duplicado: quantos CPFs têm 2+ contatos;
-- contatos_sem_cpf: contatos sem document ou CPF < 11 dígitos;
-- visitas_com_cpf_placeholder: visitas com document repetido
-- (ex. 111.111.111-11) ou vazio/nulo.
-- ============================================================================
SELECT
  (SELECT count(*) FROM (
    SELECT public.cpf_digits(c.document) AS cpf
    FROM public.contacts c
    WHERE public.cpf_digits(c.document) IS NOT NULL
      AND length(public.cpf_digits(c.document)) = 11
      AND public.cpf_digits(c.document) ~ '^(\d)\1{10}$' = false
    GROUP BY public.cpf_digits(c.document)
    HAVING count(*) > 1
  ) t) AS cpfs_com_contato_duplicado,

  (SELECT count(*)
   FROM public.contacts c
   WHERE c.document IS NULL
      OR public.cpf_digits(c.document) IS NULL
      OR length(public.cpf_digits(c.document)) <> 11) AS contatos_sem_cpf,

  (SELECT count(*)
   FROM public.appointments a
   WHERE a.client_document IS NULL
      OR public.cpf_digits(a.client_document) IS NULL
      OR length(public.cpf_digits(a.client_document)) <> 11
      OR public.cpf_digits(a.client_document) ~ '^(\d)\1{10}$') AS visitas_com_cpf_placeholder;
