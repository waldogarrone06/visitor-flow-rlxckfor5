-- Disable and remove trigger-nps automatic cron job
-- Keep track-shipping intact for delivery status synchronization
-- Keep nps_responses table and historical data untouched
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule trigger-nps-job if present
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trigger-nps-job') THEN
      PERFORM cron.unschedule('trigger-nps-job');
    END IF;

    -- Also check for any job calling trigger-nps
    FOR r IN (SELECT jobid FROM cron.job WHERE command LIKE '%trigger-nps%') LOOP
      PERFORM cron.unschedule(r.jobid);
    END LOOP;
  END IF;
END $$;
