DO $$
BEGIN
  -- First, ensure admin@example.com is set as an administrator if they exist in the DB
  UPDATE public.profiles
  SET is_admin = true
  WHERE email = 'admin@example.com';

  -- If there are absolutely no admins at all in the system, 
  -- fallback to making the oldest registered user an admin to prevent lockouts.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE is_admin = true) THEN
    UPDATE public.profiles
    SET is_admin = true
    WHERE id = (
      SELECT id FROM public.profiles
      ORDER BY created_at ASC NULLS LAST
      LIMIT 1
    );
  END IF;
END $$;
