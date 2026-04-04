DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Busca o usuário principal do Visitor Flow
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'wal@fourlabnutri.com.br' LIMIT 1;
  
  -- Se não achar pelo email, pega o primeiro usuário (assumindo ser ambiente de dev/single tenant)
  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_user_id IS NOT NULL THEN
    -- Insere ou atualiza a integração para esse usuário
    INSERT INTO public.user_integrations (user_id, whatsapp_instance_id, whatsapp_connected)
    VALUES (v_user_id, 'Jr', true)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      whatsapp_instance_id = 'Jr',
      whatsapp_connected = true,
      updated_at = NOW();
  END IF;
END $$;
