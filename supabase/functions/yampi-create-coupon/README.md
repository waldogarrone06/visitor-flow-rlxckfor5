# Yampi Create Coupon Edge Function (`yampi-create-coupon`)

Edge Function dedicada para emissão, validação, verificação de restrições e registro de cupons promocionais na API da Yampi.

## Endpoint e Rota Oficial

- **Rota Primária Oficial:** `POST https://api.dooki.com.br/v2/{alias}/pricing/promocodes`
- **Rota de Atualização Oficial:** `PUT https://api.dooki.com.br/v2/{alias}/pricing/promocodes/{id}`
- **Rota de Consulta Oficial:** `GET https://api.dooki.com.br/v2/{alias}/pricing/promocodes/{id}?include=products`
- Fallbacks anteriores (`/marketing/coupons`, `/coupons`) foram definitivamente **descartados** porque geravam HTTP 404 desnecessário e poluiam o diagnóstico.

---

## 3 Regras de Negócio Fixas Parametrizadas

A função centraliza e aplica de forma imutável as 3 regras do negócio para qualquer cupom emitido na loja Yampi:

1. **Total de cupons: SEMPRE 50 unidades**
   - Campo `quantity: 50` fixo no payload.
   - Não sobrescrevível pelo frontend.

2. **Desconto: SEMPRE em porcentagem**
   - Campo `discount_type: 'p'` fixo.
   - Apenas o valor percentual varia (ex: 10%, 15%).

3. **Exceção de catálogo: produtos cujo nome contém "kit" ou "combo" (case-insensitive) NÃO entram no cupom**
   - Ao criar qualquer cupom, a função consulta o catálogo da loja (`GET /v2/{alias}/catalog/products?page=N&limit=50`).
   - Identifica todos os produtos com `/kit/i` ou `/combo/i` no nome (ex: na FourLab foram catalogados 16 produtos correspondentes).
   - Envia os IDs desses produtos no payload de criação e validação.

---

## Verificação Empírica da Exclusão Kit/Combo (Diagnóstico Realizado)

Durante os testes empíricos com a API real da Yampi (`api.dooki.com.br`, loja `fourlab`):
- O endpoint `GET /v2/{alias}/pricing/promocodes/{id}?include=products` expõe a estrutura `restrictions: { include: {...}, exclude: { products_ids: [], brands_ids: [], ... } }`.
- Na rota oficial `POST /pricing/promocodes` e `PUT /pricing/promocodes/{id}`, o envio de campos de exclusão arbitrários como `exclude` pode ser aceito ou descartado internamente dependendo dos módulos e permissões ativas no painel da Yampi.
- Por esse motivo, o fluxo da função:
  1. Coleta o catálogo e filtra os IDs com `/kit/i` e `/combo/i`.
  2. Envia a restrição no `POST`.
  3. Consulta o cupom recém-criado com `include=products`.
  4. Se a exclusão não estiver persistida, executa tentativa complementar via `PUT /v2/{alias}/pricing/promocodes/{id}` com todos os campos obrigatórios.
  5. Se mesmo assim a exclusão não persistir ou for rejeitada pela API da Yampi, a função **NUNCA falha silenciosamente**: ela retorna o cupom criado com um aviso explícito (`warning` / `exclusionWarning`) informando que a exceção kit/combo precisa de acompanhamento ou parametrização manual no painel da Yampi.

---

## Autenticação

A Yampi exige obrigatoriamente os dois cabeçalhos em conjunto:
- `User-Token: <token>`
- `User-Secret-Key: <secret>`
- Lidos de forma segura e protegida da tabela `integration_secrets` via client `service_role`. Sem fallback em variáveis de ambiente expostas e sem logar segredos.

---

## Validação Prévia (Pre-flight)

Antes de tentar emitir o cupom, a função executa um `GET https://api.dooki.com.br/v2/{alias}/orders?page=1` para validar:
1. Comunicação de rede com a Yampi (`api.dooki.com.br`)
2. Validade do `User-Token` e `User-Secret-Key` (HTTP 401 caso inválido)
3. Existência da loja pelo `{alias}` correto (HTTP 404 caso alias errado)

---

## Regra Crítica: Obrigatoriedade do `end_at`

- **Atenção:** Embora algumas páginas de documentação citem `end_at` como opcional, **na prática a API da Yampi responde HTTP 422 `{"errors":{"end_at":["Campo obrigatório."]}}`** caso `end_at` seja omitido ou nulo.
- **Formato obrigatório:** `YYYY-MM-DD HH:MM:SS` (sem `T` ou `Z`).
- **Sem expiração (`validity_days = 0` ou não informado):** A função gera automaticamente uma data ~10 anos no futuro às `23:59:59`, garantindo que o cupom atue como "sem expiração" e satisfazendo o requisito rígido da API.
- **Com expiração definida (`validity_days > 0`):** A data de término é calculada para `hoje + N dias` às `23:59:59`.

---

## Resolução de Conflitos / Código Duplicado

Caso a Yampi responda HTTP 422/409 indicando código já existente, a função executa retry automático com sufixos sequenciais (`<codigo>2`, `<codigo>3`... até 20 tentativas), retornando o código final efetivamente registrado na loja.
