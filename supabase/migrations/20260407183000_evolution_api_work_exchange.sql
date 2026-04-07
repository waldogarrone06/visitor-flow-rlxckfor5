-- Prepare Supabase application for Evolution API Work Exchange

-- 1. Index on whatsapp_events to speed up queries for instances
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_instance ON public.whatsapp_events(instance);

-- 2. Index on whatsapp_events message_type
CREATE INDEX IF NOT EXISTS idx_whatsapp_events_message_type ON public.whatsapp_events(message_type);

-- 3. Index on messages client_id for status updates via webhook
CREATE INDEX IF NOT EXISTS idx_messages_client_id ON public.messages(client_id);

-- 4. Index on contacts phone to speed up lookups during webhook processing
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts(phone);

-- 5. Ensure interaction_log can accept all necessary details
-- Already uses JSONB for details, which is perfect for Work Exchange logs.
