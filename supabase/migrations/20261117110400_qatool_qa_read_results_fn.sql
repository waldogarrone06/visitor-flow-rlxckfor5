-- [QA E2E] Ferramenta TEMPORÁRIA de leitura dos resultados do teste (db_query
-- read-only não acessa esta tabela; esta function dá acesso via GET + fetch_url
-- e é apagada na limpeza). Leitura APENAS.

CREATE OR REPLACE FUNCTION public.qa_read_results()
RETURNS TABLE (step text, detail jsonb, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT step, detail, created_at FROM public.qa_test_log ORDER BY id
$$;
