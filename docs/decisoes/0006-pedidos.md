# 0006 — Pedidos (etapa 5)

Data: 26/11/2026 · Situação: implementado, com leituras provisórias marcadas ❓

## O que a etapa entrega

- Criar pedido (sempre nasce **Pendente**), com um ou mais itens, frete, desconto, condição de pagamento e dados de entrega.
- Listar pedidos (busca por número ou nome do cliente, filtro por status) e ver o detalhe.
- Editar pedido **somente enquanto Pendente**, por ADM ou Financeiro.
- Pré-visualizar o total (`POST /api/orders/preview`): a tela pede o cálculo ao backend, que é o único lugar onde a conta é feita.

Mudança de status, cancelamento, pagamentos e vencimentos ficam para as próximas etapas.

## Como o total é calculado

`backend/src/modules/orders/orders.calculations.ts` (função `calculateOrderTotals`):

1. Total do item = quantidade × preço unitário cobrado.
2. Produtos (subtotal) = soma dos itens.
3. Desconto: valor fixo em R$, ou percentual **sobre os produtos** (não sobre o frete).
4. Total = produtos + frete − desconto.

Tudo em `Decimal` (nunca `number`), arredondado em duas casas só no fim de cada conta. Exemplo testado: 10 × R$ 37,55 + 3 × R$ 42,15 = R$ 501,95; 5% = R$ 25,0975 → R$ 25,10; + frete R$ 25,00 → **R$ 501,85**.

Ao salvar, o backend **recalcula** tudo; o que a tela mostrou é só uma prévia.

## Preço no pedido (decisão do Nicolas, 26/11/2026)

- O item recebe o preço de tabela como sugestão; ADM e Financeiro podem digitar outro preço, sem limite e sem motivo.
- O pedido guarda os dois: `catalogUnitPrice` (tabela na hora) e `unitPrice` (cobrado). A tela mostra "Tabela: R$ …" quando forem diferentes.
- Mudar o preço do produto depois **não altera** pedidos já gravados (há teste para isso).

## Proteções de integridade

- Edição usa `version` (bloqueio otimista): se duas pessoas editam o mesmo pedido, a segunda recebe erro em vez de apagar a alteração da primeira.
- Itens, totais e histórico são gravados numa única transação.
- Restrições `CHECK` no banco: quantidade > 0 e valores nunca negativos.
- Desconto não pode passar de produtos + frete (o total nunca fica negativo).
- Toda criação e edição vai para a auditoria com o "antes" e o "depois".
- Produto inativo não entra em pedido novo, mas continua aparecendo nos pedidos antigos.

## Leituras provisórias (valem até resposta)

| Código | Leitura adotada |
|---|---|
| ❓ P-PED-1 | Número `PED-000123`, sequencial; pode "pular" um número se uma gravação falhar. |
| ❓ P-PED-3 | Nome e CPF/CNPJ do cliente copiados no pedido (dados da época). |
| ❓ P-PED-4 | Só sacos inteiros. |
| ❓ P-PED-5 | Arredondamento comercial (meio para cima), duas casas. |
| ❓ P-PED-6 | Os dois perfis editam tudo enquanto o pedido está Pendente. Confirmado em diante: ainda não editável (etapa 6). |
| ❓ P-DES-1 | Financeiro pode dar desconto, sem limite. |
| ❓ P-DES-2 | Um só desconto por pedido (não por item). |
| ❓ P-DES-3 | Percentual incide só sobre os produtos. |
| ❓ P-DES-4 | Sem motivo obrigatório. |
| ❓ P-ENT-1 | Frete digitado manualmente. |
| ❓ P-ENT-2 | Responsável pela entrega em texto livre. |
| ❓ P-ENT-3 | Retirada aceita frete (não força zero). |
