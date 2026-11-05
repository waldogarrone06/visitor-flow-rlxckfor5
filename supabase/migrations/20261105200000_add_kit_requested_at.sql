-- kit_requested_at: data em que o kit foi solicitado para envio (exibida na aba Meus Envios)
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS kit_requested_at timestamptz;

-- Backfill: data do evento 'Requested' em interaction_log; fallback = created_at do appointment
UPDATE public.appointments a
SET kit_requested_at = COALESCE(
  (
    SELECT min(l.created_at)
    FROM public.interaction_log l
    WHERE l.type = 'kit_status_changed'
      AND l.details->>'appointment_id' = a.id::text
      AND l.details->>'new_status' = 'Requested'
  ),
  a.created_at
)
WHERE a.kit_status IS NOT NULL
  AND a.kit_requested_at IS NULL;

-- Trigger: seta kit_requested_at quando o kit é solicitado (Requested), sem tocar
-- nas triggers existentes trg_update_kit_status / trg_log_kit_status_changes
CREATE OR REPLACE FUNCTION public.set_kit_requested_at()
RETURNS trigger AS $$
BEGIN
  IF NEW.kit_status = 'Requested' AND NEW.kit_requested_at IS NULL THEN
    NEW.kit_requested_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_kit_requested_at ON public.appointments;
CREATE TRIGGER trg_set_kit_requested_at
  AFTER INSERT OR UPDATE OF kit_status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_kit_requested_at();
