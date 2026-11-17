-- Expiração do access token do Google Calendar em integration_secrets.
-- slot-validation, get-availability e create-booking persistem o token
-- renovado junto com o novo expiry (google_token_expires_at). Leitura e
-- escrita continuam exclusivas do service role — a RLS existente da tabela
-- não muda e nenhuma política nova é criada.
alter table public.integration_secrets
  add column if not exists google_token_expires_at timestamptz;
