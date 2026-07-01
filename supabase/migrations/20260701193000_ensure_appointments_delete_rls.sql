DO $$
BEGIN
    -- Ensure authenticated users can delete their own appointments
    DROP POLICY IF EXISTS "Users can delete own appointments" ON public.appointments;
    CREATE POLICY "Users can delete own appointments" ON public.appointments
        FOR DELETE TO authenticated USING (auth.uid() = user_id);
END $$;
