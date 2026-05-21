-- Set default value for kit_status
ALTER TABLE public.appointments ALTER COLUMN kit_status SET DEFAULT 'Pending';

-- Backfill NULLs to 'Pending' safely
DO $$
BEGIN
  UPDATE public.appointments 
  SET kit_status = 'Pending' 
  WHERE kit_status IS NULL;
END $$;

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION public.update_kit_status_from_tracking()
RETURNS trigger AS $$
BEGIN
  IF NEW.tracking_number IS NULL OR trim(NEW.tracking_number) = '' THEN
    IF NEW.kit_status != 'Delivered' THEN
      NEW.kit_status := 'Pending';
    END IF;
  ELSE
    IF NEW.kit_status = 'Pending' OR NEW.kit_status IS NULL THEN
      NEW.kit_status := 'In Transit';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_update_kit_status ON public.appointments;
CREATE TRIGGER trg_update_kit_status
  BEFORE INSERT OR UPDATE OF tracking_number, kit_status
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_kit_status_from_tracking();
