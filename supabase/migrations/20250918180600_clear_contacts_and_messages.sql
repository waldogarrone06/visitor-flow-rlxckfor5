-- Limpa todos os contatos e mensagens conforme solicitado
DO $$
BEGIN
  DELETE FROM public.interaction_log WHERE type IN ('whatsapp_receive', 'whatsapp_send');
  DELETE FROM public.messages;
  DELETE FROM public.contact_tag_relations;
  DELETE FROM public.contacts;
END $$;
