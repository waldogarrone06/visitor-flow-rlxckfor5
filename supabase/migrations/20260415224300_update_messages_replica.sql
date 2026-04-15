DO $$
BEGIN
  -- Set Replica Identity FULL to ensure Realtime UPDATE events carry all fields 
  -- and to strengthen the reactivity of the reverse message flow
  ALTER TABLE public.messages REPLICA IDENTITY FULL;
  ALTER TABLE public.contacts REPLICA IDENTITY FULL;
END $$;
