-- Add new columns to appointments for Kit and Coupon tracking
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS kit_status TEXT DEFAULT 'Pending';
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS coupon_verified BOOLEAN DEFAULT FALSE;

-- Create kits table
CREATE TABLE IF NOT EXISTS public.kits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_personalized BOOLEAN DEFAULT FALSE,
    prescriber_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create kit items table
CREATE TABLE IF NOT EXISTS public.kit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_id UUID NOT NULL REFERENCES public.kits(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1
);

-- Create NPS responses table
CREATE TABLE IF NOT EXISTS public.nps_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Policies for Kits
ALTER TABLE public.kits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own kits" ON public.kits;
CREATE POLICY "Users manage own kits" ON public.kits
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS Policies for Kit Items
ALTER TABLE public.kit_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own kit items" ON public.kit_items;
CREATE POLICY "Users manage own kit items" ON public.kit_items
    FOR ALL TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.kits WHERE id = kit_items.kit_id AND user_id = auth.uid())
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.kits WHERE id = kit_items.kit_id AND user_id = auth.uid())
    );

-- RLS Policies for NPS Responses
ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can insert NPS" ON public.nps_responses;
CREATE POLICY "Anon can insert NPS" ON public.nps_responses
    FOR INSERT TO anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "Auth can insert NPS" ON public.nps_responses;
CREATE POLICY "Auth can insert NPS" ON public.nps_responses
    FOR INSERT TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Users view own NPS" ON public.nps_responses;
CREATE POLICY "Users view own NPS" ON public.nps_responses
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM public.appointments WHERE id = nps_responses.appointment_id AND user_id = auth.uid())
    );
