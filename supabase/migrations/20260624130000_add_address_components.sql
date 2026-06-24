-- Add new address components to the appointments table for detailed shipping logistics
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS clinic_number TEXT,
ADD COLUMN IF NOT EXISTS clinic_neighborhood TEXT,
ADD COLUMN IF NOT EXISTS clinic_complement TEXT;
