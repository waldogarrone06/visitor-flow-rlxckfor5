-- Atualiza a trigger update_kit_status_from_tracking para não reverter status de Entregue
CREATE OR REPLACE FUNCTION public.update_kit_status_from_tracking()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Se o novo status já for Entregue/Delivered (ex: atualizado via edge function), deixamos como está
  IF NEW.kit_status IN ('Entregue', 'Delivered') THEN
    RETURN NEW;
  END IF;

  -- Se não houver rastreio, reverte para Pending
  IF NEW.tracking_number IS NULL OR trim(NEW.tracking_number) = '' THEN
    NEW.kit_status := 'Pending';
  ELSE
    -- Se tem rastreio e estava Pending/In Transit/NULL, muda para Enviado
    IF NEW.kit_status IS NULL OR NEW.kit_status = 'Pending' OR NEW.kit_status = 'In Transit' THEN
      NEW.kit_status := 'Enviado';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;
