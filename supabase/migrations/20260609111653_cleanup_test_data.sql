DO $$
BEGIN
  -- Cleanup test records from appointments
  -- Cascading deletes will automatically handle related records in nps_responses
  DELETE FROM public.appointments
  WHERE client_name ILIKE 'waldo'
     OR client_name ILIKE 'wal werner'
     OR client_name ILIKE 'juliana maciel'
     OR client_email ILIKE '%@exemplo.com';

  -- Cleanup test records from contacts
  -- Cascading deletes will automatically handle related records in messages, interaction_log, and contact_tag_relations
  DELETE FROM public.contacts
  WHERE name ILIKE 'waldo'
     OR name ILIKE 'wal werner'
     OR name ILIKE 'juliana maciel'
     OR email ILIKE '%@exemplo.com';
END $$;
