CREATE OR REPLACE FUNCTION public.update_kit_status_from_tracking()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Status Protection: Once the status is "Entregue" or "Delivered", 
  -- it must be protected from reverting regardless of further edits.
  IF TG_OP = 'UPDATE' AND OLD.kit_status IN ('Entregue', 'Delivered') THEN
    NEW.kit_status := OLD.kit_status;
    RETURN NEW;
  END IF;
  
  -- If explicitly setting to Entregue/Delivered via UI or Edge Function
  IF NEW.kit_status IN ('Entregue', 'Delivered') THEN
    RETURN NEW;
  END IF;
  
  -- If there is no tracking number, revert to Pending
  IF NEW.tracking_number IS NULL OR trim(NEW.tracking_number) = '' THEN
    NEW.kit_status := 'Pending';
  ELSE
    -- If there is a tracking number, the status is Enviado
    NEW.kit_status := 'Enviado';
  END IF;
  
  RETURN NEW;
END;
$function$;
