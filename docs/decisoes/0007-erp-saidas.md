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

**Atenção:** ainda não existe a ação de confirmar uma saída (etapa E). Até lá, todo pedido novo fica Pendente e o painel mostra zeros para as saídas efetivadas. Nos testes, as situações são gravadas direto no banco.
