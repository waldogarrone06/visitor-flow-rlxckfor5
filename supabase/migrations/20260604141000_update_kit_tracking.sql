DO $$
DECLARE
  new_user_id uuid;
BEGIN
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
      -- Auditoria S3: sem senha pré-fixada (aleatória descartável).
      crypt(gen_random_uuid()::text, gen_salt('bf')),
      NOW(), NOW(), NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Wal"}',
      false, 'authenticated', 'authenticated',
      '', '', '', '', '', NULL, '', '', ''
    );

    INSERT INTO public.profiles (id, email, name, is_admin)
    VALUES (new_user_id, 'wal@fourlabnutri.com.br', 'Wal', true)
    ON CONFLICT (id) DO NOTHING;
    
    INSERT INTO public.user_integrations (user_id)
    VALUES (new_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_kit_status_from_tracking()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Se o novo status já for Entregue/Delivered, deixamos como está sem alterações
  IF NEW.kit_status IN ('Entregue', 'Delivered') THEN
    RETURN NEW;
  END IF;
  
  -- Se não houver rastreio, reverte para Pending
  IF NEW.tracking_number IS NULL OR trim(NEW.tracking_number) = '' THEN
    NEW.kit_status := 'Pending';
  ELSE
    -- Se tem rastreio, verifica se foi recém-adicionado para mudar para Enviado
    IF TG_OP = 'INSERT' THEN
      IF NEW.kit_status NOT IN ('Entregue', 'Delivered') THEN
        NEW.kit_status := 'Enviado';
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      IF (OLD.tracking_number IS NULL OR trim(OLD.tracking_number) = '') AND (NEW.tracking_number IS NOT NULL AND trim(NEW.tracking_number) <> '') THEN
        IF NEW.kit_status NOT IN ('Entregue', 'Delivered') THEN
          NEW.kit_status := 'Enviado';
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_update_kit_status ON public.appointments;
CREATE TRIGGER trg_update_kit_status
  BEFORE INSERT OR UPDATE OF tracking_number, kit_status
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_kit_status_from_tracking();
