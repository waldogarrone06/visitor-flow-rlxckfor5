-- Add tracking_number column to appointments table for logistics tracking
ALTER TABLE IF EXISTS public.appointments ADD COLUMN IF NOT EXISTS tracking_number TEXT;
