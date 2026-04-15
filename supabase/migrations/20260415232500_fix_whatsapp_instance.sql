DO $$
BEGIN
  -- Atualiza o whatsapp_instance_id de 'jr' para 'Junior' (ignorando case) para alinhar com o webhook da Evolution API
  UPDATE public.user_integrations
  SET whatsapp_instance_id = 'Junior'
  WHERE LOWER(TRIM(whatsapp_instance_id)) = 'jr';
END $$;
