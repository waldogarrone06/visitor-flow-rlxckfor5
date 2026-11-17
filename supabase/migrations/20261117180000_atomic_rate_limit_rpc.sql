-- RPC atômica do rate limiter: substitui o par INSERT + SELECT que cada check
-- de limite fazia na tabela public.rate_limit_events. Uma única viagem ao
-- banco incrementa o contador de cada janela e devolve o count atual —
-- a get-availability antes fazia isso DUAS vezes (janela por minuto e por
-- hora); agora faz UMA chamada com as duas janelas.
--
-- Formato: o chamador manda 1..N regras (bucket, max, window_seconds) e
-- recebe um array com o mesmo número de resultados, na mesma ordem:
-- { limit, count, ok }. Cada evento fica marcado com a sua janela
-- (window_seconds) para a contagem só somar eventos da mesma regra/janela.

-- Coluna que distingue a janela de cada evento (minuto vs hora vs dia).
ALTER TABLE public.rate_limit_events
  ADD COLUMN IF NOT EXISTS window_seconds integer NOT NULL DEFAULT 60;

-- Índice que cobre a contagem por bucket/janela/janela de tempo.
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_bucket_window_created_at
  ON public.rate_limit_events (bucket, window_seconds, created_at);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_rules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule jsonb;
  v_bucket text;
  v_max integer;
  v_window integer;
  v_window_start timestamptz;
  v_count integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'array' OR jsonb_array_length(p_rules) = 0 THEN
    RAISE EXCEPTION 'p_rules deve ser um array jsonb não vazio';
  END IF;

  FOR v_rule IN SELECT * FROM jsonb_array_elements(p_rules)
  LOOP
    v_bucket := v_rule->>'bucket';
    v_max := (v_rule->>'max')::integer;
    v_window := (v_rule->>'windowSeconds')::integer;

    IF v_bucket IS NULL OR v_bucket = '' OR v_max IS NULL OR v_max <= 0 OR v_window IS NULL OR v_window <= 0 THEN
      RAISE EXCEPTION 'Regra de rate limit inválida (bucket/max/windowSeconds)';
    END IF;

    -- Janela fixa deslizante por evento (mesma semântica do código anterior).
    v_window_start := now() - make_interval(secs => v_window);

    -- Registra a tentativa ANTES de decidir: toda requisição conta.
    INSERT INTO public.rate_limit_events (bucket, created_at, window_seconds)
    VALUES (v_bucket, now(), v_window);

    SELECT count(*)::integer INTO v_count
    FROM public.rate_limit_events
    WHERE bucket = v_bucket
      AND window_seconds = v_window
      AND created_at >= v_window_start;

    v_results := v_results || jsonb_build_object(
      'limit', v_max,
      'count', v_count,
      'ok', (v_count <= v_max)
    );
  END LOOP;

  -- Poda barata (~5% das chamadas): remove eventos mais antigos que 24h.
  IF random() < 0.05 THEN
    DELETE FROM public.rate_limit_events WHERE created_at < now() - interval '24 hours';
  END IF;

  RETURN v_results;
END;
$$;

-- Execução: a RPC é chamada pelas edge functions com a service role, que ignora
-- RLS. Nenhum papel de cliente (anon/authenticated) pode executá-la.
REVOKE ALL ON FUNCTION public.check_rate_limit(jsonb) FROM PUBLIC, anon, authenticated;
