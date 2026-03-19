-- Add locked_slots table for schedule management
CREATE TABLE IF NOT EXISTS public.locked_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lock_date DATE NOT NULL,
    start_time TEXT,
    end_time TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.locked_slots ENABLE ROW LEVEL SECURITY;

-- Allow anon to read locked slots for public booking availability
DROP POLICY IF EXISTS "Anon can view locked slots" ON public.locked_slots;
CREATE POLICY "Anon can view locked slots" ON public.locked_slots
    FOR SELECT TO anon USING (true);

-- Allow authenticated users to view all (or their own)
DROP POLICY IF EXISTS "Users view locked slots" ON public.locked_slots;
CREATE POLICY "Users view locked slots" ON public.locked_slots
    FOR SELECT TO authenticated USING (true);

-- Allow users to manage their own locked slots
DROP POLICY IF EXISTS "Users manage own locked slots" ON public.locked_slots;
CREATE POLICY "Users manage own locked slots" ON public.locked_slots
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Ensure appointments can be read by anon for capacity checking
DROP POLICY IF EXISTS "Anon can view appointments for capacity" ON public.appointments;
CREATE POLICY "Anon can view appointments for capacity" ON public.appointments
    FOR SELECT TO anon USING (true);
