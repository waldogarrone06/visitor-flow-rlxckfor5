-- Unificação de cadastros duplicados por CPF (data-only, idempotente).
-- Regras:
--  1. Contatos: mesmo user_id + CPF de 11 dígitos (ignora placeholders tipo 000.000.000-00 / 111.111.111-11).
--     Mantém o cadastro mais completo (mais campos preenchidos) e, em empate, o mais antigo.
--     Reaponta messages, interaction_log e contact_tag_relations para o mantido, depois apaga os demais.
--  2. Appointments: só remove linhas SEM kit/envio que dividem exatamente o mesmo slot
--     (mesmo user_id + CPF + data + start_time + end_time) com outra linha. Linhas com kit nunca são tocadas.
--     Retornos futuros em horários diferentes são preservados.
--  3. Linhas de lead capture (appointment_date = 1970-01-01) nunca são tocadas.
-- Tudo dentro de um único bloco DO (atômico).

DO $$
BEGIN
  -- ---------- 1. CONTATOS ----------
  CREATE TEMP TABLE IF NOT EXISTS tmp_contact_merge ON COMMIT DROP AS
  WITH base AS (
    SELECT
      c.id,
      c.user_id,
      c.created_at,
      regexp_replace(coalesce(c.document, ''), '\D', '', 'g') AS cpf,
      (btrim(coalesce(c.email, '')) <> '')::int
        + (btrim(coalesce(c.address, '')) <> '')::int
        + (btrim(coalesce(c.profession, '')) <> '')::int
        + (btrim(coalesce(c.specialty, '')) <> '')::int
        + (btrim(coalesce(c.registration_number, '')) <> '')::int
        + (btrim(coalesce(c.instagram, '')) <> '')::int
        + (btrim(coalesce(c.patients_per_month, '')) <> '')::int
        + (btrim(coalesce(c.nutritionist_coupon, '')) <> '')::int
        + (btrim(coalesce(c.patient_coupon, '')) <> '')::int
        + (btrim(coalesce(c.cep, '')) <> '')::int
        + (btrim(coalesce(c.number, '')) <> '')::int
        + (btrim(coalesce(c.neighborhood, '')) <> '')::int
        + (btrim(coalesce(c.complement, '')) <> '')::int
        + (btrim(coalesce(c.city, '')) <> '')::int
        + (btrim(coalesce(c.state, '')) <> '')::int
        + (c.last_inbound_at IS NOT NULL)::int
        + (c.lgpd_consent_at IS NOT NULL)::int AS score
    FROM public.contacts c
  ),
  valid AS (
    SELECT * FROM base
    WHERE length(cpf) = 11 AND cpf !~ '^(\d)\1{10}$'
  ),
  ranked AS (
    SELECT v.*,
      row_number() OVER (PARTITION BY v.user_id, v.cpf ORDER BY v.score DESC, v.created_at ASC, v.id ASC) AS rn,
      count(*) OVER (PARTITION BY v.user_id, v.cpf) AS grp_n
    FROM valid v
  ),
  keepers AS (
    SELECT user_id, cpf, id AS keeper_id FROM ranked WHERE rn = 1 AND grp_n > 1
  )
  SELECT r.id AS loser_id, k.keeper_id
  FROM ranked r
  JOIN keepers k ON k.user_id = r.user_id AND k.cpf = r.cpf
  WHERE r.rn > 1;

  -- Reaponta vínculos antes de apagar
  UPDATE public.messages m
     SET contact_id = t.keeper_id
    FROM tmp_contact_merge t
   WHERE m.contact_id = t.loser_id;

  UPDATE public.interaction_log l
     SET contact_id = t.keeper_id
    FROM tmp_contact_merge t
   WHERE l.contact_id = t.loser_id;

  INSERT INTO public.contact_tag_relations (contact_id, tag_id, created_at)
  SELECT t.keeper_id, r.tag_id, r.created_at
    FROM public.contact_tag_relations r
    JOIN tmp_contact_merge t ON t.loser_id = r.contact_id
  ON CONFLICT DO NOTHING;

  DELETE FROM public.contacts c
   USING tmp_contact_merge t
   WHERE c.id = t.loser_id;

  -- ---------- 2. APPOINTMENTS (somente duplicatas de slot exato, sem kit) ----------
  DELETE FROM public.appointments a
   USING (
     SELECT id FROM (
       SELECT
         ap.id,
         row_number() OVER (
           PARTITION BY ap.user_id,
                        regexp_replace(coalesce(ap.client_document, ''), '\D', '', 'g'),
                        ap.appointment_date, ap.start_time, ap.end_time
           ORDER BY (ap.kit_name IS NOT NULL OR ap.tracking_number IS NOT NULL OR ap.kit_status IS DISTINCT FROM 'Pending') DESC,
                    ap.created_at ASC, ap.id ASC
         ) AS rn,
         (ap.kit_name IS NOT NULL OR ap.tracking_number IS NOT NULL OR ap.kit_status IS DISTINCT FROM 'Pending') AS has_kit,
         count(*) OVER (
           PARTITION BY ap.user_id,
                        regexp_replace(coalesce(ap.client_document, ''), '\D', '', 'g'),
                        ap.appointment_date, ap.start_time, ap.end_time
         ) AS slot_n
       FROM public.appointments ap
       WHERE ap.appointment_date <> DATE '1970-01-01'
         AND length(regexp_replace(coalesce(ap.client_document, ''), '\D', '', 'g')) = 11
         AND regexp_replace(coalesce(ap.client_document, ''), '\D', '', 'g') !~ '^(\d)\1{10}$'
     ) s
     WHERE s.slot_n > 1 AND s.rn > 1 AND s.has_kit = false
   ) d
   WHERE a.id = d.id;
END $$;
