ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS prescriber_notified BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_prescriber_email(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_email TEXT;
  v_google_email TEXT;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  SELECT google_email INTO v_google_email FROM public.user_integrations WHERE user_id = p_user_id;
  
  RETURN COALESCE(v_google_email, v_email);
END;
$$ LANGUAGE plpgsql;
