-- Add clinic_city column to appointments for invoice issuance
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS clinic_city TEXT;
