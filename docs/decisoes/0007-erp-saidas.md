# 0007 — ERP e módulo Saídas de Cimento

Data: 26/11/2026 · Plano completo: `planejamento/plano-erp-saidas.md` (pasta de arquivos do projeto)

## Decisões do Nicolas (26/11/2026)

1. **"Saída de Cimento" = Pedido.** O módulo de pedidos evolui; não existe módulo paralelo. Na tela o nome é "Saídas de Cimento"; o endereço continua `/pedidos` por enquanto.
2. **Formas de pagamento:** Dinheiro, Pix, Cheque, Depósito, Cartão de débito, Cartão de crédito, Transferência bancária.
3. **"A prazo" é condição, não forma:** À vista, 10 dias, 15 dias, 30 dias, prazo negociado. (30 dias é novo em relação ao prazo anterior: 10, 15 e negociado.)
4. **Pagamentos parciais e múltiplas formas na mesma saída:** implementados na etapa D; a arquitetura já deve prever vários pagamentos por saída.
5. **Rascunho:** reaproveitar o status Pendente, desde que ele represente uma operação ainda não confirmada: editável e **fora dos indicadores do dashboard**. Ao confirmar, a saída passa a "efetivada". Antes de reutilizar, verificar se o significado de registros existentes muda; se mudar, criar status específico de rascunho.
6. **Tipo de operação:** só "Venda" por ora, com estrutura pronta para novos tipos (bonificação, transferência…).
7. **Descontos:** por item **e** geral sobre o total da saída, sem duplicidade ou inconsistência.
8. **Logística:** campos de texto (motorista, ajudante, veículo, placa, responsável pelo transporte, endereço, observações). Cadastros próprios de motoristas e veículos ficam para o futuro.
9. **Estoque:** só preparar a arquitetura; nenhuma venda é bloqueada por falta de estoque.

## Etapa A — Layout (esta etapa)

Só frontend. Nada de regra de negócio ou banco.

- `components/navigation.ts`: lista única de módulos (menu, título e breadcrumb leem daqui). Perfis: "Usuários e Permissões" só para o ADM.
- `Sidebar`, `Topbar`, `Icon`, `Layout`: menu lateral recolhível (preferência guardada no navegador), cabeçalho com breadcrumb, busca rápida de saídas (número ou cliente), menu do perfil (Minha conta, Trocar senha, Sair). Em tablet/celular o menu vira gaveta.
- Módulos ainda inexistentes (Orçamentos, Financeiro, Relatórios, Configurações do Sistema) mostram "Em desenvolvimento", sem dados nem botões falsos.
- Clientes e Produtos aparecem uma vez só, em Cadastros (o pedido original os listava também em Comercial).
- **Notificações:** o sino ainda não existe porque não há nenhum evento real para avisar. Entra quando houver (ex.: vencimentos atrasados, etapa D).
- Minha Conta: dados do usuário logado e atalho para trocar a senha.

## Etapa B — Dashboard (indicadores reais)

Endpoint `GET /api/dashboard?from=AAAA-MM-DD&to=AAAA-MM-DD` (ADM e Financeiro). Sem parâmetros: do dia 1º do mês até hoje. Máximo de 366 dias. O período anterior tem a mesma duração e termina na véspera do início (usado só para a variação %).

**O que conta (decisão do Nicolas, 26/11/2026):** só saídas **efetivadas**: Confirmado, Em separação, Saiu para entrega e Concluído. Pendente (rascunho) e Cancelado ficam fora de todos os indicadores. Os pendentes aparecem à parte, num aviso ("N saídas pendentes aguardando confirmação"), sem somar nos números.

| Indicador | Definição |
|---|---|
| Saídas | Quantidade de pedidos efetivados no período |
| Sacos vendidos | Soma das quantidades dos itens desses pedidos |
| Faturamento | Soma do **total** dos pedidos (produtos + frete − descontos) — ❓ P-DASH-2 |
| Ticket médio | Faturamento ÷ quantidade de saídas (arredondado a centavos, meio para cima; 0 se não houve saída) |
| Clientes atendidos | Clientes distintos com ao menos uma saída efetivada |
| Evolução por dia | Saídas, sacos e faturamento por dia; dias sem venda aparecem zerados |
| Vendas por produto | Sacos e **valor dos itens** (antes de frete e desconto geral), top 10 |
| Clientes por volume | Top 10 por sacos, com faturamento |
| Últimas saídas | 8 mais recentes efetivadas do período |

- O "dia" e o "mês" são os de **Brasília** (America/Sao_Paulo), independentemente do fuso do servidor. Há testes nas viradas de dia/mês.
- ❓ P-DASH-1: o período usa a **data de registro do pedido** (`created_at`). Quando existir uma "data da saída" própria (etapa C) ou a data de confirmação, a coluna é trocada num só lugar (`DATE_COLUMN`).
- Cálculos em `Decimal` no backend/PostgreSQL; no frontend os valores são só formatados (o único `Number` é para a altura das barras do gráfico).

**Não calculado (de propósito):** valor recebido, saldo a receber e recebimentos por forma de pagamento. Dependem dos pagamentos (etapa D); mostrar agora seria inventar número.

Decisões confirmadas pelo Nicolas em 26/11/2026: P-DASH-1 (período pela data de registro do pedido) e P-DASH-2 (faturamento = produtos + frete − descontos, independentemente de ter sido recebido). A ação de confirmar, que alimenta o painel, está na seção seguinte.

## Confirmação de saída (antecipada da etapa E)

`POST /api/orders/:id/confirm` com `{ "version": n, "note": "opcional" }`.

Decisões do Nicolas (26/11/2026), P-STA:
- **Só o ADM confirma.** O Financeiro vê a saída (e continua editando enquanto Pendente), mas não confirma: a rota responde 403 e a tela nem mostra o botão.
- A confirmação exige **confirmação explícita** na tela (painel com cliente, sacos e total, e aviso de que depois não se edita).
- Registra **quem e quando** no histórico de status (com observação opcional) e na auditoria (`order.confirm`, com o pedido inteiro antes e depois).
- Pendente → Confirmado; a saída passa a contar no painel.

Integridade (nada financeiro muda sem registro):
- Só Pendente pode ser confirmado; cancelado ou já confirmado → 409. Duas confirmações simultâneas: só uma vale (teste).
- A `version` enviada precisa ser a atual: se o pedido foi editado depois que o ADM abriu a tela, a confirmação é recusada e o ADM confere os novos valores antes de confirmar.
- A confirmação **não altera nenhum valor** do pedido. Depois de confirmado, o pedido deixa de ser editável (só Pendente edita), então preços, itens, frete e desconto ficam congelados.
- Mudança, histórico e auditoria são gravados na mesma transação.

Ainda não implementado (etapa E): Em separação, Saiu para entrega, Concluído e Cancelado (com motivo). Quem pode alterar um pedido já confirmado continua em aberto (P-PED-6/7).

## Etapa C1 — Backend da tela de Saídas (escopo aprovado em 26/11/2026)

Migration `20261126180000_orders_c1` (incremental, só acrescenta):
- `PaymentTerm`: novo valor `TERM_30_DAYS` (30 dias).
- `OrderOperationType` (só `SALE` = Venda) e `orders.operation_type`. Novos tipos = novos valores do enum, sem refazer o módulo.
- `order_items`: `discount_type`, `discount_value`, `discount_amount` (padrão 0). CHECK: `discount_amount` entre 0 e quantidade × preço; `line_total = quantidade × preço − desconto`. Pedidos antigos têm desconto 0 e já cumprem.
- `orders`: `driver_name`, `helper_name`, `vehicle`, `license_plate`, `loaded_bags` (CHECK ≥ 0), na própria tabela (extrair para uma tabela de logística só quando houver o módulo de logística). "Responsável pelo transporte" continua sendo `delivery_responsible`.

**Regra de desconto (sem duplicidade)** — `orders.calculations.ts`:
1. bruto do item = quantidade × preço cobrado;
2. desconto do item (R$ ou %) incide só sobre o bruto desse item; líquido = bruto − desconto;
3. produtos = soma dos líquidos;
4. desconto geral: % sobre os produtos já com os descontos dos itens (nunca sobre o frete); fixo em R$ até produtos + frete (regra que já existia);
5. total = produtos + frete − desconto geral. Verificado nos testes: bruto + frete − (descontos dos itens + geral) = total.

**Lista** `GET /api/orders`: filtros `from`, `to` (data de registro, dias inteiros de Brasília), `customerId`, `productId`, `paymentTerm` (condição), `status`, `search`; ordenação `sortBy` (número, data, cliente, total, situação) e `sortDir` (lista fixa, nunca texto livre no banco); resposta traz `totals.effective` e `totals.pending` (saídas, sacos e valor do **filtro inteiro**, não só da página). Canceladas não entram em nenhum dos dois grupos.

**Histórico de alterações** `GET /api/orders/:id/history`: eventos da auditoria (registrada, editada, confirmada) com quem, quando e só o que mudou, em texto pt-BR.

**Busca de cliente** também por telefone.

Decisões provisórias aprovadas (P-C-1..6): data da saída = data de registro, somente leitura; desconto por item nos mesmos dois tipos do geral e sem limite; sacos carregados e placa sem validação de formato (placa em maiúsculas); "rascunho" = Pendente; totalizadores pelo filtro inteiro; rota continua `/pedidos`.

**Forma de pagamento** (Pix, cartão…) como filtro depende dos pagamentos (etapa D); por enquanto filtra-se pela **condição** de pagamento.
