-- Ensure the tracking fields exist and triggers are correct
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS melhor_envio_token TEXT;

-- Drop and recreate the trigger function to ensure it's up to date
CREATE OR REPLACE FUNCTION public.update_kit_status_from_tracking()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.tracking_number IS NULL OR trim(NEW.tracking_number) = '' THEN
    IF NEW.kit_status != 'Delivered' AND NEW.kit_status != 'Entregue' THEN
      NEW.kit_status := 'Pending';
    END IF;
  ELSE
    IF NEW.kit_status = 'Pending' OR NEW.kit_status IS NULL OR NEW.kit_status = 'In Transit' THEN
      NEW.kit_status := 'Enviado';
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
