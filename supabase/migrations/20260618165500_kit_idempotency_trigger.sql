-- Create the new interaction_log logger for kit status changes
CREATE OR REPLACE FUNCTION public.log_kit_status_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.kit_status IS DISTINCT FROM NEW.kit_status THEN
    INSERT INTO public.interaction_log (user_id, contact_id, type, details, created_at)
    VALUES (
      NEW.user_id,
      NULL,
      'kit_status_changed',
      jsonb_build_object(
        'appointment_id', NEW.id,
        'old_status', OLD.kit_status,
        'new_status', NEW.kit_status,
        'tracking_number', NEW.tracking_number,
        'source', 'database_trigger'
      ),
      now()
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_kit_status_changes ON public.appointments;

CREATE TRIGGER trg_log_kit_status_changes
  AFTER UPDATE OF kit_status
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.log_kit_status_changes();


-- Re-define the existing trigger to be more strict with Idempotency
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

  -- Idempotency protection: Once it's "Requested" or "Enviado", avoid dropping to "Pending" automatically
  IF TG_OP = 'UPDATE' AND OLD.kit_status IN ('Requested', 'Enviado') AND NEW.kit_status = 'Pending' THEN
    -- Allow if user explicitly cleared tracking number, but otherwise keep the status
    IF OLD.tracking_number IS NOT NULL AND (NEW.tracking_number IS NULL OR trim(NEW.tracking_number) = '') THEN
       -- Let it revert to Pending if they clear the tracking number
    ELSE
       NEW.kit_status := OLD.kit_status;
    END IF;
  END IF;

  -- If explicitly setting to Entregue/Delivered via UI or Edge Function
  IF NEW.kit_status IN ('Entregue', 'Delivered') THEN
    RETURN NEW;
  END IF;

  -- If there is no tracking number, revert to Pending, unless it's explicitly Requested/Enviado
  IF NEW.tracking_number IS NULL OR trim(NEW.tracking_number) = '' THEN
    IF NEW.kit_status NOT IN ('Requested', 'Enviado') THEN
      NEW.kit_status := 'Pending';
    END IF;
  ELSE
    -- If there is a tracking number, auto-promote to Enviado if it's Pending
    IF NEW.kit_status = 'Pending' OR NEW.kit_status IS NULL THEN
      NEW.kit_status := 'Enviado';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
