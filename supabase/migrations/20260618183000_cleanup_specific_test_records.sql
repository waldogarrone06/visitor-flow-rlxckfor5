DO $$
DECLARE
  new_user_id uuid;
BEGIN
  -- Ensure wal@fourlabnutri.com.br exists with password Skip@Pass and fixed token fields
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'wal@fourlabnutri.com.br') THEN
    new_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current,
      phone, phone_change, phone_change_token, reauthentication_token
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'wal@fourlabnutri.com.br',
      crypt('Skip@Pass', gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Walquiria"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );
    
    INSERT INTO public.profiles (id, email, name, is_admin)
    VALUES (new_user_id, 'wal@fourlabnutri.com.br', 'Walquiria', true)
    ON CONFLICT (id) DO NOTHING;
  ELSE
    UPDATE auth.users 
    SET encrypted_password = crypt('Skip@Pass', gen_salt('bf')),
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        email_change_token_current = COALESCE(email_change_token_current, ''),
        phone_change = COALESCE(phone_change, ''),
        phone_change_token = COALESCE(phone_change_token, ''),
        reauthentication_token = COALESCE(reauthentication_token, '')
    WHERE email = 'wal@fourlabnutri.com.br';
  END IF;
  
  -- Cascading cleanup for interaction_log
  DELETE FROM public.interaction_log 
  WHERE contact_id IN (
    SELECT id FROM public.contacts 
    WHERE name ILIKE '%Joao Silva%' 
       OR name ILIKE '%João Silva%' 
       OR name ILIKE '%Farmacia Saude%' 
       OR name ILIKE '%Farmácia Saúde%'
  );
  
  -- Cascading cleanup for contact_tag_relations
  DELETE FROM public.contact_tag_relations 
  WHERE contact_id IN (
    SELECT id FROM public.contacts 
    WHERE name ILIKE '%Joao Silva%' 
       OR name ILIKE '%João Silva%' 
       OR name ILIKE '%Farmacia Saude%' 
       OR name ILIKE '%Farmácia Saúde%'
  );
  
  -- Cascading cleanup for messages
  DELETE FROM public.messages 
  WHERE contact_id IN (
    SELECT id FROM public.contacts 
    WHERE name ILIKE '%Joao Silva%' 
       OR name ILIKE '%João Silva%' 
       OR name ILIKE '%Farmacia Saude%' 
       OR name ILIKE '%Farmácia Saúde%'
  );
  
  -- Cleanup contacts
  DELETE FROM public.contacts 
  WHERE name ILIKE '%Joao Silva%' 
     OR name ILIKE '%João Silva%' 
     OR name ILIKE '%Farmacia Saude%' 
     OR name ILIKE '%Farmácia Saúde%';
  
  -- Cascading cleanup for nps_responses tied to appointments
  DELETE FROM public.nps_responses 
  WHERE appointment_id IN (
    SELECT id FROM public.appointments 
    WHERE client_name ILIKE '%Joao Silva%' 
       OR client_name ILIKE '%João Silva%' 
       OR client_name ILIKE '%Farmacia Saude%' 
       OR client_name ILIKE '%Farmácia Saúde%'
  );
  
  -- Cleanup appointments
  DELETE FROM public.appointments 
  WHERE client_name ILIKE '%Joao Silva%' 
     OR client_name ILIKE '%João Silva%' 
     OR client_name ILIKE '%Farmacia Saude%' 
     OR client_name ILIKE '%Farmácia Saúde%';
END $$;
