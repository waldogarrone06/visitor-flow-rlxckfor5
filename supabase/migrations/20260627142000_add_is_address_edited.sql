ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS is_address_edited BOOLEAN DEFAULT false;
