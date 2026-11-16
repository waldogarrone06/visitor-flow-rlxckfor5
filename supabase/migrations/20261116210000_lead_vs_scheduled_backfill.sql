-- Separar CAPTURA DE LEAD de AGENDAMENTO CONFIRMADO.
--
-- Modelo escolhido: STATUS (não coluna nova `kind`). É o menos invasivo:
-- `status` já existe (default 'scheduled'), já tem índice (idx_appointments_status)
-- e todo o código (RLS, front, edge functions) já filtra por ele.
--
-- Semântica final:
--   'lead'      => EXCLUSIVAMENTE captura de contato (LeadCapture, data sentinela
--                  1970-01-01, sem slot real). NÃO recebe lembrete, NPS ou sync.
--   'scheduled' => agendamento real confirmado (página pública via create-booking,
--                  solicitação de kit via KitBuilder, agendamento manual).
--   'Visited' / 'Cancelled' / 'Rescheduled' => estados subsequentes, inalterados.
--
-- O backfill NÃO reescreve tudo para um valor só: apenas as linhas `lead` com
-- data REAL voltam a `scheduled` (eram agendamentos públicos ou solicitações de
-- kit que o backfill anterior uniformizou para 'lead'). As capturas de lead
-- (sentinela 1970-01-01) permanecem 'lead'.

UPDATE public.appointments
SET status = 'scheduled'
WHERE lower(status) = 'lead'
  AND appointment_date <> DATE '1970-01-01';
