DO $$
DECLARE
  v_contact_ids uuid[];
  v_appointment_ids uuid[];
BEGIN
  -- Collect contact IDs matching the test names
  SELECT array_agg(id) INTO v_contact_ids
  FROM public.contacts
  WHERE name ILIKE '%Waldo garro%'
     OR name ILIKE '%poip%';

  -- Collect appointment IDs matching the test names
  SELECT array_agg(id) INTO v_appointment_ids
  FROM public.appointments
  WHERE client_name ILIKE '%Waldo garro%'
     OR client_name ILIKE '%poip%';

  -- 1. Delete interaction_log records linked to the test contacts
  IF v_contact_ids IS NOT NULL THEN
    DELETE FROM public.interaction_log
    WHERE contact_id = ANY(v_contact_ids);
  END IF;

  -- 2. Delete messages records linked to the test contacts
  IF v_contact_ids IS NOT NULL THEN
    DELETE FROM public.messages
    WHERE contact_id = ANY(v_contact_ids);
  END IF;

  -- 3. Delete contact_tag_relations records linked to the test contacts
  IF v_contact_ids IS NOT NULL THEN
    DELETE FROM public.contact_tag_relations
    WHERE contact_id = ANY(v_contact_ids);
  END IF;

  -- 4. Delete nps_responses linked to the test appointments
  IF v_appointment_ids IS NOT NULL THEN
    DELETE FROM public.nps_responses
    WHERE appointment_id = ANY(v_appointment_ids);
  END IF;

  -- 5. Delete kit_items linked to kits whose prescriber_email matches the test contacts
  DELETE FROM public.kit_items
  WHERE kit_id IN (
    SELECT id FROM public.kits
    WHERE prescriber_email IN (
      SELECT email FROM public.contacts
      WHERE name ILIKE '%Waldo garro%'
         OR name ILIKE '%poip%'
    )
  );

  -- 6. Delete kits whose prescriber_email matches the test contacts
  DELETE FROM public.kits
  WHERE prescriber_email IN (
    SELECT email FROM public.contacts
    WHERE name ILIKE '%Waldo garro%'
       OR name ILIKE '%poip%'
  );

  -- 7. Delete appointments matching the test names
  DELETE FROM public.appointments
  WHERE client_name ILIKE '%Waldo garro%'
     OR client_name ILIKE '%poip%';

  -- 8. Delete contacts matching the test names
  DELETE FROM public.contacts
  WHERE name ILIKE '%Waldo garro%'
     OR name ILIKE '%poip%';
END $$;
