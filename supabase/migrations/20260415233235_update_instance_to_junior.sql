DO $$
BEGIN
  -- Corrigir o nome da instância conforme solicitado pelo usuário
  UPDATE public.user_integrations 
  SET whatsapp_instance_id = 'Junior' 
  WHERE whatsapp_instance_id = 'Jr';
END $$;
