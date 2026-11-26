# 0008 — Pagamentos das saídas (etapa D)

Decisões de Nicolas em 26/11/2026, sobre a proposta de escopo da etapa D. A etapa é dividida em **D1 (backend)** e **D2 (frontend, dashboard)**; o D2 só começa depois da aprovação do D1.

## Decisões

1. **Elegibilidade (P-PAG-10).** Só saídas Confirmadas ou em estados posteriores recebem pagamentos. Pendentes e Canceladas não recebem.
2. **Um pagamento por saída (P-PAG-3).** Cada pagamento pertence a uma única saída; pagamento compartilhado entre saídas não existe nesta versão.
3. **Situação inicial (P-PAG-1).**
   - Dinheiro e cartão (débito/crédito): **Confirmado** ao registrar.
   - Pix, depósito e transferência: **Pendente** até a conferência do recebimento.
   - Cheque: **A compensar**.
   - ADM e Financeiro confirmam após conferir. Um pagamento nunca vira "recebido" só por ter sido registrado.
4. **Meio e conta (P-PAG-2).** São campos separados. Cheque entra obrigatoriamente na **Carteira de cheques**; dinheiro obrigatoriamente no **Caixa físico**; nos demais meios escolhe-se a conta (Bradesco ou Caixa Econômica).
5. **Compensação (P-PAG-4).** Ao compensar um cheque a conta de destino é obrigatória. A troca de conta fica no histórico do pagamento e na auditoria; a passagem pela Carteira de cheques nunca é apagada.
6. **Permissões (P-PAG-5).** ADM e Financeiro registram, confirmam, compensam e estornam. Estorno exige motivo. Cada operação grava usuário, data, hora e motivo.
7. **Saldo (P-PAG-6).** A tela mostra separados: total da saída; **total recebido** (Confirmados); **total a compensar** (A compensar); **saldo a receber** = total − Confirmados. Pendentes e A compensar não reduzem o saldo a receber.
8. **Limite (P-PAG-9, ajustada).** A soma dos pagamentos Confirmados + Pendentes + A compensar não pode ultrapassar o total da saída. Existem dois números diferentes: **saldo a receber** (total − Confirmados) e **valor disponível para novos registros** (total − Confirmados − Pendentes − A compensar). Estornado deixa de comprometer o limite. A validação é no backend, dentro de transação com bloqueio da saída, para funcionar com operações simultâneas.
9. **Cheque devolvido (P-PAG-8).** Estorna-se o cheque com motivo; o saldo e a disponibilidade voltam; o cheque substituto é um **novo pagamento**; o histórico do anterior é preservado.
10. **Dados do cheque (P-PAG-7).** Número, banco, valor, data de recebimento e data prevista de compensação. Sem emitente nem agência.
11. **Vencimentos (P-PRA-5).** À vista: nenhum. 10/15/30 dias: um vencimento calculado a partir da data de registro (dia de Brasília), editável. Negociado: um ou mais vencimentos cuja soma é igual ao total. Pagamentos **Confirmados** abatem os vencimentos mais antigos primeiro; Pendentes e A compensar não abatem. **Em atraso** = vencimento anterior a hoje com valor em aberto.
12. **Bloqueio após confirmação.** Valores, produtos, frete e descontos de saída confirmada continuam imutáveis. Não há renegociação de vencimentos nesta etapa.

## Como foi modelado (D1)

- **Sem duplicar o que se calcula:** totais (recebido, a compensar, saldo, disponível) e o quanto cada vencimento já foi pago **não são gravados**; são calculados a partir dos pagamentos a cada consulta.
- Tabelas novas: `receiving_accounts` (as 4 contas, cadastro de referência criado pela migração), `payments` (inclui os campos do cheque, com CHECK no banco), `payment_status_history` (cada mudança de situação/conta, com usuário, hora e motivo) e `order_due_dates`.
- `payments.amount > 0` e consistência dos campos do cheque são garantidas por CHECK no banco. A regra "soma não passa do total" não cabe em CHECK de linha; é garantida no serviço com `SELECT ... FOR UPDATE` na saída.
- Nada é apagado: correção = estorno + novo lançamento. Toda operação grava auditoria na mesma transação.

## Leituras provisórias do D1 (a confirmar)

- **P-D-1 — Quando nascem os vencimentos.** 10/15/30 dias: gerados na confirmação da saída (data de registro + prazo). Negociado: definidos depois, por `PUT /api/orders/:id/due-dates`. Editar vencimentos só é permitido **enquanto não há pagamento não estornado** na saída (depois disso seria renegociação, fora desta etapa). Os vencimentos substituídos ficam guardados (marcados como substituídos), nunca apagados.
- **P-D-2 — Conta de destino da compensação** deve ser uma conta bancária (Bradesco ou Caixa Econômica).
- **P-D-3 — Contas por meio.** Pix, depósito, transferência e cartões exigem conta bancária (não Caixa físico nem Carteira de cheques).
- **P-D-4 — Estorno** vale para qualquer situação (Pendente, A compensar ou Confirmado); Estornado é definitivo.
- **P-D-5 — Data de recebimento** assume hoje (Brasília) se não for informada.
- **P-D-6 — Saída cancelada** (etapa E): pagamentos já lançados continuam consultáveis e estornáveis; novos não são aceitos.

## Fora do D1

Telas (D2), indicadores do painel (recebido, a receber, por meio/conta, em atraso) e filtro por forma de pagamento na lista (a API do filtro entra no D1, a tela no D2).

## API do D1

| Rota | O que faz |
|---|---|
| `GET /api/receiving-accounts` | contas de recebimento |
| `GET /api/orders/:id/payments` | pagamentos, resumo (total, recebido, a compensar, pendente, saldo, disponível), vencimentos com pago/em aberto/atraso |
| `POST /api/orders/:id/payments` | registra pagamento (situação inicial decidida pelo backend) |
| `PUT /api/orders/:id/due-dates` | define vencimentos (leitura P-D-1) |
| `POST /api/payments/:id/confirm` | Pendente → Confirmado |
| `POST /api/payments/:id/clear` | cheque A compensar → Confirmado, com conta de destino |
| `POST /api/payments/:id/reverse` | estorno com motivo |
| `GET /api/orders?paymentMethod=PIX` | filtro da lista por forma de pagamento |

Não existe rota para apagar pagamento. Todas as rotas exigem login e perfil ADM ou Financeiro.

## Testes do D1

Cobrem elegibilidade, situação inicial por meio, regras de conta, limite (inclusive o exemplo de R$ 2.000), estorno e cheque devolvido, permissões (401 sem login), histórico e auditoria, vencimentos e atraso, filtro da lista, CHECKs do banco e concorrência (2 e 6 registros simultâneos; 2 confirmações e 2 estornos simultâneos). Sem o bloqueio da saída, o teste de 6 registros simultâneos falha.

## D2 — Telas e painel

- **Detalhe da saída:** seção "Pagamentos" (a partir de Confirmado): resumo (total, recebido, a compensar, pendentes, saldo a receber, disponível), vencimentos com pago/em aberto/atraso, lançamentos com histórico, registrar pagamento, confirmar recebimento, compensar cheque (escolhendo a conta) e estornar (motivo obrigatório). A tela só mostra e chama a API; o backend confere tudo.
- **Lista de saídas:** filtro "Forma de pagamento" e coluna "Saldo a receber" (— em Pendente e Cancelada).
- **Painel:** bloco "Financeiro" (recebido no período, a receber hoje, em atraso, a compensar, pendentes de conferência) e recebido por forma de pagamento e por conta. Sem dados fictícios: tudo vem dos pagamentos gravados.

### Definições dos indicadores (aprovadas por Nicolas em 26/11/2026)

- **Recebido no período** = confirmações do período − estornos do período, cada evento na **data em que aconteceu** (dia de Brasília, lida do histórico do pagamento), qualquer que seja a data da venda.
  - O pagamento confirmado soma na data da confirmação; cheque, na data da **compensação** (não a do recebimento do cheque).
  - O estorno de um pagamento que estava Confirmado subtrai na data do **estorno**. Confirmar e estornar no mesmo período dá efeito líquido zero; estornar num período posterior preserva o período da confirmação e deixa o do estorno negativo.
  - Estornar um pagamento que ainda não estava Confirmado (Pix pendente, cheque a compensar) não altera o recebido.
  - Nada é apagado: o cálculo lê o histórico (`payment_status_history`).
- **A receber:** posição **atual**, sem filtro de período: total das saídas Confirmadas e posteriores (sem Canceladas) − pagamentos Confirmados delas. Um estorno devolve o valor ao saldo.
- **Por forma de pagamento e por conta:** mesmo critério líquido; a conta é a atual do pagamento (cheque compensado no Bradesco e depois devolvido subtrai no Bradesco). Linhas com líquido zero não aparecem.
- **Em atraso:** vencimento anterior a hoje com valor em aberto, depois de abatidos os Confirmados (mais antigos primeiro).
