-- Grant explícito do execute da RPC de rate limit para a service role (usada
-- pelas edge functions). A RPC foi revogada de PUBLIC/anon/authenticated na
-- migration anterior; o service_role precisa de grant próprio para chamar.
GRANT EXECUTE ON FUNCTION public.check_rate_limit(jsonb) TO service_role;
