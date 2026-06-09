DO $$
BEGIN
  -- Delete kits associated with the test contacts' emails
  -- kit_items will be deleted automatically due to ON DELETE CASCADE
  DELETE FROM public.kits
  WHERE prescriber_email IN (
    SELECT email FROM public.contacts
    WHERE email IS NOT NULL AND (
       email ILIKE '%@exemplo.com'
       OR name ILIKE 'Wal Werner'
       OR name ILIKE 'Waldo de O Garrone'
    )
  );

  -- Delete the test contacts
  -- contact_tag_relations, messages, and interaction_log will be deleted automatically due to ON DELETE CASCADE
  DELETE FROM public.contacts
  WHERE email ILIKE '%@exemplo.com'
     OR name ILIKE 'Wal Werner'
     OR name ILIKE 'Waldo de O Garrone';
END $$;
