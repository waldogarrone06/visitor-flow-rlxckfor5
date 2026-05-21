-- Add kit_name column to appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS kit_name TEXT;

-- Update trigger function to use 'Enviado' instead of 'In Transit'
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

-- Update existing records
UPDATE public.appointments SET kit_status = 'Enviado' WHERE kit_status = 'In Transit';
