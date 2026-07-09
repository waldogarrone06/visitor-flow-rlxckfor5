-- Purge all appointments for "Waldo Garrone" and related data
-- Frees locked slots and ensures data integrity
DO $$
DECLARE
  v_appointment_ids uuid[];
  v_contact_ids uuid[];
BEGIN
  -- Collect appointment IDs for "Waldo Garrone" (case-insensitive exact match)
  SELECT array_agg(id) INTO v_appointment_ids
  FROM public.appointments
  WHERE client_name ILIKE 'Waldo Garrone';

  IF v_appointment_ids IS NULL THEN
    RETURN;
  END IF;

  -- Collect contact IDs matching "Waldo Garrone"
  SELECT array_agg(id) INTO v_contact_ids
  FROM public.contacts
  WHERE name ILIKE 'Waldo Garrone';

  -- 1. Delete nps_responses linked to these appointments
  DELETE FROM public.nps_responses
  WHERE appointment_id = ANY(v_appointment_ids);

  -- 2. Delete interaction_log, messages, contact_tag_relations for matching contacts
  IF v_contact_ids IS NOT NULL THEN
    DELETE FROM public.interaction_log
    WHERE contact_id = ANY(v_contact_ids);

    DELETE FROM public.messages
    WHERE contact_id = ANY(v_contact_ids);

    DELETE FROM public.contact_tag_relations
    WHERE contact_id = ANY(v_contact_ids);
  END IF;

  -- 3. Delete kit_items and kits linked to matching contacts via prescriber_email
  DELETE FROM public.kit_items
  WHERE kit_id IN (
    SELECT id FROM public.kits
    WHERE prescriber_email IN (
      SELECT email FROM public.contacts
      WHERE name ILIKE 'Waldo Garrone'
    )
  );

  DELETE FROM public.kits
  WHERE prescriber_email IN (
    SELECT email FROM public.contacts
    WHERE name ILIKE 'Waldo Garrone'
  );

  -- 4. Delete locked_slots matching the appointment dates and times (free the schedule)
  DELETE FROM public.locked_slots ls
  USING public.appointments a
  WHERE a.id = ANY(v_appointment_ids)
    AND ls.user_id = a.user_id
    AND ls.lock_date = a.appointment_date
    AND (
      (ls.start_time = a.start_time AND ls.end_time = a.end_time)
      OR (ls.start_time IS NULL AND ls.end_time IS NULL)
    );

  -- 5. Delete the appointments
  DELETE FROM public.appointments
  WHERE id = ANY(v_appointment_ids);

  -- 6. Delete contacts matching "Waldo Garrone"
  DELETE FROM public.contacts
  WHERE name ILIKE 'Waldo Garrone';
END $$;
