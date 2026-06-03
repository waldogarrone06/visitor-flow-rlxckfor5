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
      NEW.kit_status := 'Enviado';
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.tracking_number IS NULL OR trim(OLD.tracking_number) = '' THEN
        NEW.kit_status := 'Enviado';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;
