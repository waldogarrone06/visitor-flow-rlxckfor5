-- Create appointments table for public bookings
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_phone TEXT,
    appointment_date DATE NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Allow anon to insert appointments
CREATE POLICY "Anon can insert appointments" ON public.appointments
    FOR INSERT TO anon
    WITH CHECK (true);

-- Allow authenticated users to manage their own appointments
CREATE POLICY "Users manage own appointments" ON public.appointments
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Update schedule_settings RLS to allow anon to select
CREATE POLICY "Anon can view schedules" ON public.schedule_settings
    FOR SELECT TO anon
    USING (true);
