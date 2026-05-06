DO $$
BEGIN
  -- Delete all messages
  DELETE FROM public.messages;
  
  -- Delete all contact tag relations
  DELETE FROM public.contact_tag_relations;
  
  -- Delete interaction logs related to contacts
  DELETE FROM public.interaction_log WHERE contact_id IS NOT NULL;
  
  -- Delete all contacts
  DELETE FROM public.contacts;
END $$;
