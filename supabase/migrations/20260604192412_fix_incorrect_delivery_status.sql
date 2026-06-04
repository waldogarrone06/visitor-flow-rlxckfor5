DO $$
BEGIN
  -- Disable trigger to allow reverting the protected status
  ALTER TABLE public.appointments DISABLE TRIGGER trg_update_kit_status;

  UPDATE public.appointments
  SET
    kit_status = 'Enviado',
    delivered_at = NULL
  WHERE tracking_number = 'ME2628RUHC8BR'
    AND kit_status IN ('Delivered', 'Entregue');

  -- Re-enable trigger
  ALTER TABLE public.appointments ENABLE TRIGGER trg_update_kit_status;
END $$;
