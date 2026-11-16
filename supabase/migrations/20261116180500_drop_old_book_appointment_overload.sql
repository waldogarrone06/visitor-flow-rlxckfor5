-- ============================================================
-- Remove a sobrecarga ANTIGA de book_appointment (sem p_lgpd_consent_at),
-- que ficaria como sombra da nova assinatura e nunca gravaria o consentimento.
-- ============================================================

DROP FUNCTION IF EXISTS public.book_appointment(
  uuid, date, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text, text, text, integer
);
