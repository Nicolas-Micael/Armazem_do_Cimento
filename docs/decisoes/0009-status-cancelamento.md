# 0009 — Status operacionais e cancelamento (etapa E)

Decisões de Nicolas em 26/11/2026 sobre a proposta de escopo da etapa E. A etapa é dividida em **E1 (backend)** e **E2 (telas)**; o E2 só começa depois da aprovação do E1.

## Decisões

1. **Fluxo operacional.** Confirmado → Em separação → Saiu para entrega → Concluído. Em **retirada** é permitido Em separação → Concluído diretamente. Em **entrega** não se pula etapa. (Em retirada, passar por "Saiu para entrega" continua permitido: a decisão só acrescentou o atalho.)
2. **Retorno de status.** Só o ADM. Um passo por vez, com motivo obrigatório (mínimo 3 caracteres). Concluído e Cancelado são definitivos.
3. **Permissões.** ADM e Financeiro avançam o status; só o ADM retorna status ou cancela. Confirmar a saída (Pendente → Confirmado) continua só do ADM.
4. **Cancelamento.** Só o ADM. Permitido em Pendente (rascunho), Confirmado e Em separação; não em Saiu para entrega nem Concluído. Motivo obrigatório (texto livre, mínimo 3 caracteres). O histórico é preservado.
5. **Cancelamento e pagamentos.**
   - Pagamentos **Pendentes** e **A compensar** precisam ser estornados antes do cancelamento.
   - Se houver qualquer pagamento **Confirmado**, o cancelamento é **bloqueado** nesta etapa. A mensagem explica que é preciso fazer a devolução efetiva do dinheiro ao cliente e que estornar o lançamento não comprova essa devolução.
   - A devolução de dinheiro (conta de origem, valor, data, responsável e motivo) fica para uma etapa futura.
6. **Concluído.** Significa entregue ou retirado de fato. Não exige quitação: pode concluir com saldo a receber. Registra a **data efetiva** da entrega/retirada (padrão: hoje; editável). O campo `orders.actual_delivery_date` já existia no banco e atende a essa finalidade; nenhum campo novo foi criado.
7. **Bloqueio de edição** mantido integralmente: depois de confirmada, não se altera produto, quantidade, preço, frete nem desconto. Sem exceções nesta etapa.
8. **Painel.** Confirmado, Em separação, Saiu para entrega e Concluído continuam nos indicadores; Cancelado fica fora. As definições financeiras aprovadas não mudam.
9. **Implementação.** Máquina de estados no backend (a tela não valida nada); mudança de status + histórico + auditoria na mesma transação; versionamento para concorrência; nenhuma função de devolução, crédito, nota fiscal ou estoque.

## Como foi modelado (E1)

- **Sem tabelas ou colunas novas.** Já existiam o enum com todos os status, `order_status_history` (de/para, usuário, hora e `note`) e `actual_delivery_date`. O motivo de retorno/cancelamento fica em `note` do histórico de status e também na auditoria.
- **Rotas:** `POST /api/orders/:id/advance` (`{ to, version, deliveredAt?, note? }`, ADM e Financeiro), `POST /api/orders/:id/revert` (`{ version, reason }`, só ADM) e `POST /api/orders/:id/cancel` (`{ version, reason }`, só ADM).
- **Regras em `orders.status.ts`** (funções puras, testadas sozinhas) e execução em `orders.status.service.ts`.
- **Concorrência:** a saída é bloqueada (`SELECT ... FOR UPDATE`), a versão enviada precisa ser a atual e o `UPDATE` só vale se o status continua o mesmo. O mesmo bloqueio é usado pelo registro de pagamentos, então **cancelar e registrar pagamento ao mesmo tempo nunca terminam com pagamento ativo numa saída cancelada**.
- Cada mudança incrementa `version`, grava `order_status_history` e `audit_logs` na mesma transação. Nada é apagado.

## Leituras provisórias do E1 (a confirmar)

- **P-E-1 — Estorno de pagamento Confirmado libera o cancelamento.** A regra bloqueia só enquanto existir pagamento com situação *Confirmado*. Como o D1 permite estornar um Confirmado (ex.: cheque devolvido por falta de fundos), um ADM poderia estornar o lançamento só para cancelar. A auditoria do cancelamento registra quantos pagamentos já estiveram Confirmados e foram estornados, para rastrear. Se isso deve ser proibido, é preciso distinguir "cheque devolvido" de "dinheiro devolvido" no estorno (decisão futura, junto da devolução).
- **P-E-2 — Data efetiva.** Não pode estar no futuro nem antes do dia do registro da saída (dia de Brasília). Se isso atrapalhar a operação real, relaxar.
- **P-E-3 — Confirmado não volta a Pendente** (voltar a rascunho reabriria a edição de valores, contra o bloqueio). O retorno mais antigo permitido é Em separação → Confirmado.
- **P-E-4 — Concluir uma entrega que ainda não "saiu para entrega"** não é permitido (sem pular etapa); em retirada o atalho vale.

## Testes (E1)

- `orders.status.test.ts`: regras puras de transição.
- `orders.status.api.test.ts` (30 testes): fluxo de entrega e retirada, sem pular etapa, permissões (Financeiro avança; só ADM retorna e cancela), data efetiva, motivo mínimo de 3 caracteres, cancelamento por status, cancelamento com pagamentos (Confirmado bloqueia; Pendente/A compensar exigem estorno), versão antiga (409), concorrência (avanços simultâneos, avançar × cancelar, cancelar × pagamento), indicadores, 401/404 e ausência de rota de exclusão.
- Verificação por mutação: sem a regra do pagamento Confirmado, 3 testes falham; sem o bloqueio da saída (`lockOrder`), o teste de concorrência falha.
- Suíte completa do backend: 263 testes passando; `tsc --noEmit` limpo.
