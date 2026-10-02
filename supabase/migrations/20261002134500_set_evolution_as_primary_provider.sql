-- Atualizar o default de primary_provider para 'evolution'
ALTER TABLE public.user_integrations 
  ALTER COLUMN primary_provider SET DEFAULT 'evolution';

-- Atualizar todos os registros existentes em user_integrations para primary_provider = 'evolution'
-- Conforme pedido do usuário: "no menu mensagens trocar o modo de envio de mensagens da api oficial para evolution api"
UPDATE public.user_integrations
SET primary_provider = 'evolution'
WHERE primary_provider IS DISTINCT FROM 'evolution';
