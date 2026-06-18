DO $$
DECLARE
  rec RECORD;
BEGIN
  -- 1. Delete dependent records for appointments before deleting appointments
  FOR rec IN 
    SELECT id FROM public.appointments 
    WHERE lower(client_name) IN (
      'academia corpo fortte',
      'farmacia saude',
      'joao silva',
      'maria souza',
      'carlos santos'
    )
  LOOP
    DELETE FROM public.nps_responses WHERE appointment_id = rec.id;
    DELETE FROM public.appointments WHERE id = rec.id;
  END LOOP;

  -- 2. Delete dependent records for contacts before deleting contacts
  FOR rec IN 
    SELECT id FROM public.contacts 
    WHERE lower(name) IN (
      'academia corpo fortte',
      'farmacia saude',
      'joao silva',
      'maria souza',
      'carlos santos'
    )
  LOOP
    DELETE FROM public.interaction_log WHERE contact_id = rec.id;
    DELETE FROM public.messages WHERE contact_id = rec.id;
    DELETE FROM public.contact_tag_relations WHERE contact_id = rec.id;
    DELETE FROM public.contacts WHERE id = rec.id;
  END LOOP;
END $$;
