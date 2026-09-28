-- Ensure trigger for kit_status populates delivered_at if status becomes Entregue/Delivered and delivered_at is null
CREATE OR REPLACE FUNCTION public.update_kit_status_from_tracking()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
BEGIN
  -- If kit_status is being set to Entregue or Delivered, ensure delivered_at is set
  IF NEW.kit_status IN ('Entregue', 'Delivered') THEN
    IF NEW.delivered_at IS NULL THEN
      NEW.delivered_at := COALESCE(OLD.delivered_at, now());
    END IF;
    RETURN NEW;
  END IF;

  -- Status Protection: Once the status is "Entregue" or "Delivered",
  -- it must be protected from reverting to Pending or Enviado accidentally
  IF TG_OP = 'UPDATE' AND OLD.kit_status IN ('Entregue', 'Delivered') THEN
    NEW.kit_status := OLD.kit_status;
    IF NEW.delivered_at IS NULL THEN
      NEW.delivered_at := OLD.delivered_at;
    END IF;
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
    IF NEW.delivered_at IS NULL THEN
      NEW.delivered_at := COALESCE(OLD.delivered_at, now());
    END IF;
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
$$;

-- Schedule cron jobs for trigger-nps and track-shipping if pg_cron is present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Ensure track-shipping runs every 3 hours during daytime
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE command LIKE '%track-shipping%') THEN
      PERFORM cron.schedule(
        'track-shipping-job',
        '0 */3 * * *',
        'SELECT net.http_post(url := ''https://zbtaxosxmxoidrtmojfx.supabase.co/functions/v1/track-shipping'', headers := jsonb_build_object(''Content-Type'', ''application/json''));'
      );
    END IF;

    -- Schedule trigger-nps to run daily at 10:00 AM UTC (7:00 AM BRT)
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE command LIKE '%trigger-nps%') THEN
      PERFORM cron.schedule(
        'trigger-nps-job',
        '0 10 * * *',
        'SELECT net.http_post(url := ''https://zbtaxosxmxoidrtmojfx.supabase.co/functions/v1/trigger-nps'', headers := jsonb_build_object(''Content-Type'', ''application/json''));'
      );
    END IF;
  END IF;
END $$;
