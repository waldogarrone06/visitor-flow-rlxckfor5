-- Remove policies de INSERT anônimo em appointments e contacts.
-- Auditoria de segurança: nenhuma tela do front depende mais do INSERT direto
-- anônimo — o fluxo público de agendamento passa pela edge function
-- create-booking (service role) e pela RPC book_appointment, que já aplica a
-- trava de capacidade e a exigência de consentimento LGPD no servidor.
-- Único insert de front (KitBuilder) é autenticado com user_id próprio e cai na
-- policy "Auth can insert appointments" — não afetado.
DROP POLICY IF EXISTS "Anon can insert appointments" ON public.appointments;
DROP POLICY IF EXISTS "Anon can insert contacts" ON public.contacts;
