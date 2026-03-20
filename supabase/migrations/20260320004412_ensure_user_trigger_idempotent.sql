DO $$
BEGIN
  -- Recreate the function to ensure it's fully idempotent and handles new users correctly
  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS $func$
  BEGIN
    INSERT INTO public.profiles (id, email, name)
    VALUES (NEW.id, NEW.email, coalesce(NEW.raw_user_meta_data->>'name', 'Usuário'))
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_integrations (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
  END;
  $func$ LANGUAGE plpgsql SECURITY DEFINER;

  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
END $$;
