-- Add coupon_usage_count to appointments
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS coupon_usage_count INTEGER NOT NULL DEFAULT 0;

-- Add Yampi integration tokens to user_integrations
ALTER TABLE public.user_integrations ADD COLUMN IF NOT EXISTS yampi_token TEXT;
ALTER TABLE public.user_integrations ADD COLUMN IF NOT EXISTS yampi_alias TEXT;
