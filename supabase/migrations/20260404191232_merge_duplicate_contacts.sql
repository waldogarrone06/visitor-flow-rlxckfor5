DO $$
DECLARE
  rec RECORD;
  dup RECORD;
  alt_phone TEXT;
BEGIN
  -- Percorre os contatos ordenados pela data de criação
  FOR rec IN
    SELECT id, user_id, phone, created_at
    FROM public.contacts
    ORDER BY created_at ASC
  LOOP
    -- Verifica se o contato atual ainda existe (pode ter sido mesclado em iterações anteriores)
    IF EXISTS (SELECT 1 FROM public.contacts WHERE id = rec.id) THEN
      
      -- Identifica a variação do número com ou sem o nono dígito (apenas BR)
      IF rec.phone LIKE '55%' AND length(rec.phone) = 13 THEN
        alt_phone := substr(rec.phone, 1, 4) || substr(rec.phone, 6);
      ELSIF rec.phone LIKE '55%' AND length(rec.phone) = 12 THEN
        alt_phone := substr(rec.phone, 1, 4) || '9' || substr(rec.phone, 5);
      ELSE
        alt_phone := rec.phone;
      END IF;

      -- Encontra contatos duplicados para o mesmo usuário
      FOR dup IN
        SELECT id
        FROM public.contacts
        WHERE user_id = rec.user_id
          AND id != rec.id
          AND (phone = rec.phone OR phone = alt_phone)
      LOOP
        -- Transfere as mensagens do contato duplicado para o contato original mais antigo
        UPDATE public.messages
        SET contact_id = rec.id
        WHERE contact_id = dup.id;

        -- Remove o contato duplicado vazio
        DELETE FROM public.contacts
        WHERE id = dup.id;
      END LOOP;

    END IF;
  END LOOP;
END $$;
