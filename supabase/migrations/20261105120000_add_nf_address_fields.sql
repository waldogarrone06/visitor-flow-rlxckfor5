-- Campos de endereço completo para emissão de NF
-- contacts: número, bairro, complemento, cidade e estado do endereço
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS number TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS complement TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT;

-- appointments: estado da clínica (cidade já existe)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS clinic_state TEXT;
