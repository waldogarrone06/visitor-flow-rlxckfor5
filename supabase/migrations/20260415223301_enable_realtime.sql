DO $$
BEGIN
  -- Habilita o realtime para as tabelas messages e contacts, permitindo que a UI receba os eventos
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'contacts') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
    END IF;
  END IF;
END $$;
