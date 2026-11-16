-- Auditoria S4/S5/S6/S9 (2026-11-17)
--
-- S4: book_appointment NÃO é mais executável por anon/authenticated.
--     O agendamento público passa pela edge function create-booking
--     (service_role). Capacidade já é constante interna da RPC
--     (p_max_capacity ignorado) e agora também fica fora do alcance de quem
--     chama a RPC diretamente.
--
-- S5/S6 (equivalente em SQL): get_fixed_meet_link e get_appointment_meet_link
--     são SECURITY DEFINER e vazavam o link de reunião para qualquer anônimo
--     com o id. Sem chamadores no front (nenhum rpc() encontrado no código
--     cliente) — exceto a validação do formulário NPS (/nps/:id), que usa a
--     edge function nps-appointment-name (service role). Execução fica só com
--     service_role.
--
-- S9: UNIQUE(appointment_id) em nps_responses — uma resposta por agendamento.
--     Backfill: mantém a resposta MAIS RECENTE (created_at mais alto) de cada
--     appointment_id, remove as demais.

-- ===== S9: deduplicar NPS antes de criar a constraint ======================
DELETE FROM public.nps_responses a
USING public.nps_responses b
WHERE a.appointment_id = b.appointment_id
  AND a.created_at < b.created_at;           -- mantém a mais recente

-- empate em created_at: mantém o maior id
DELETE FROM public.nps_responses a
USING public.nps_responses b
WHERE a.appointment_id = b.appointment_id
  AND a.created_at = b.created_at
  AND a.id < b.id;

ALTER TABLE public.nps_responses
  ADD CONSTRAINT nps_responses_appointment_id_key UNIQUE (appointment_id);

-- ===== S4/S5/S6: grants — execução só para service_role ====================
REVOKE ALL ON FUNCTION public.book_appointment FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_fixed_meet_link(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_appointment_meet_link(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_appointment TO service_role;
GRANT EXECUTE ON FUNCTION public.get_fixed_meet_link(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_appointment_meet_link(uuid) TO service_role;
