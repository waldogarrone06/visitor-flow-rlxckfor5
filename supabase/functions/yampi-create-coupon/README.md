# Yampi Create Coupon Edge Function (`yampi-create-coupon`)

Edge Function dedicada para emissão, validação e registro de cupons/códigos promocionais na API da Yampi.

## Endpoint e Rota Oficial

- **Rota Primária Oficial:** `POST https://api.dooki.com.br/v2/{alias}/pricing/promocodes`
- Fallbacks anteriores (`/marketing/coupons`, `/coupons`) foram **descartados** porque geravam HTTP 404 desnecessário e poluiam o diagnóstico.

## Autenticação

A Yampi exige obrigatoriamente os dois cabeçalhos em conjunto:
- `User-Token: <token>`
- `User-Secret-Key: <secret>`
- Lidos de forma segura e protegida da tabela `integration_secrets` via client `service_role`.

## Validação Prévia (Pre-flight)

Antes de tentar emitir o cupom, a função executa um `GET https://api.dooki.com.br/v2/{alias}/orders?page=1` para validar:
1. Comunicação de rede com a Yampi
2. Validade do `User-Token` e `User-Secret-Key` (HTTP 401 caso inválido)
3. Existência da loja pelo `{alias}` correto (HTTP 404 caso alias errado)

## Regra Crítica: Obrigatoriedade do `end_at`

- **Atenção:** Embora algumas páginas da documentação da Yampi citem `end_at` como opcional, **na prática a API da Yampi retorna HTTP 422 `{"errors":{"end_at":["Campo obrigatório."]}}`** caso `end_at` seja omitido ou nulo.
- **Formato obrigatório:** `YYYY-MM-DD HH:MM:SS` (sem `T` ou `Z`).
- **Sem expiração (validity_days = 0 ou não informado):** A função gera automaticamente uma data ~10 anos no futuro às `23:59:59`, garantindo que o cupom nunca expire de forma prematura e satisfazendo o requisito da API.
- **Com expiração definida (`validity_days > 0`):** A data de término é calculada para `hoje + N dias` às `23:59:59`.

## Resolução de Conflitos / Código Duplicado

Caso a Yampi responda HTTP 422 indicando código já existente, a função executa retry automático com sufixos sequenciais (`<codigo>2`, `<codigo>3`... até 20 tentativas), retornando o código final efetivamente registrado.
