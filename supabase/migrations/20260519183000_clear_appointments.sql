DO $$
BEGIN
  -- User requested to clean the database from all past appointments and locks
  DELETE FROM public.nps_responses;
  DELETE FROM public.appointments;
  DELETE FROM public.locked_slots;
END $$;
