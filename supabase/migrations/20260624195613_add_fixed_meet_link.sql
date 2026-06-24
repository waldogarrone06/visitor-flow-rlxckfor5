ALTER TABLE public.user_integrations
ADD COLUMN IF NOT EXISTS fixed_meet_link TEXT;
