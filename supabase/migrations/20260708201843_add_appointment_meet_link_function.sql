-- Helper function to get the effective meet link for an appointment
-- Prioritizes google_meet_link, falls back to fixed_meet_link from user_integrations
CREATE OR REPLACE FUNCTION public.get_appointment_meet_link(p_appointment_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meet_link TEXT;
  v_fixed_link TEXT;
  v_user_id UUID;
BEGIN
  SELECT google_meet_link, user_id
  INTO v_meet_link, v_user_id
  FROM public.appointments
  WHERE id = p_appointment_id;

  IF v_meet_link IS NOT NULL AND v_meet_link != '' THEN
    RETURN v_meet_link;
  END IF;

  SELECT fixed_meet_link INTO v_fixed_link
  FROM public.user_integrations
  WHERE user_id = v_user_id;

  RETURN COALESCE(v_fixed_link, '');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_appointment_meet_link(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_appointment_meet_link(UUID) TO anon;

-- Ensure get_fixed_meet_link grants are correct for edge function usage
GRANT EXECUTE ON FUNCTION public.get_fixed_meet_link(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_fixed_meet_link(UUID) TO anon;
