-- Ensure client_document column exists
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS client_document TEXT;

-- Update specific user to logistics role to ensure they can see all shipments
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Anderson must be able to see this information across all consolidated shipments from all users
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'anderson@fourlabnutri.com.br';
  
  IF v_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET role = 'logistics', is_admin = true
    WHERE id = v_user_id;
  END IF;
END $$;
