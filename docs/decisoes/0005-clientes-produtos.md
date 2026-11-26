# 0005 — Clientes e produtos

**Data:** 26/11/2026 · **Situação:** implementado; respostas de Nicolas aplicadas em 26/11/2026

## O que já estava definido
- ADM gerencia clientes e produtos; Financeiro consulta clientes e produtos (requisitos de 25/11/2026).
- Preço nunca fixo no código, cadastrável e editável; o preço praticado será copiado em cada pedido (etapa 5).
- Clientes e produtos nunca são apagados: são desativados. Produtos inativos não aparecem para novos pedidos, mas continuam no histórico.
- CPF/CNPJ é validado quando informado; evitar cadastro duplicado.

## Respostas de Nicolas (26/11/2026)
| Pergunta | Decisão | Onde está no código |
|---|---|---|
| P-CLI-1 — Financeiro cadastra/edita clientes? | **Sim**: ADM e Financeiro consultam, cadastram e editam (inclusive desativam) | `CAN_MANAGE_CUSTOMERS` em `customers.routes.ts` |
| P-CLI-2 — CPF/CNPJ obrigatório? | Sem resposta explícita: **mantido opcional**, validado e sem repetição quando informado | `documentSchema` em `customers.schemas.ts` |
| P-CLI-3 — Vários endereços por cliente? | **Não**: um endereço por cliente | modelo `Customer` |
| P-PRO-1 — Só ADM altera produtos e preços? | **Sim** | `CAN_MANAGE_PRODUCTS` em `products.routes.ts` |
| P-PRO-2 — Campos do produto | Nome, marca, tipo de cimento e preço. **Sem peso do saco** (coluna removida pela migration `20261126130000_remove_product_bag_weight`) | modelo `Product` |
| P-PRO-3 — Preço por cliente/quantidade? | Existe um **preço de tabela pré-fixado**, mas o preço é variável e **pode ser alterado conforme alguns fatores** | Ver abaixo |

### Preço de tabela × preço do pedido
O cadastro do produto guarda só o **preço de tabela** (sugerido). Como o preço praticado pode mudar conforme fatores da negociação, o pedido (etapa 5) vai **copiar o preço de tabela como sugestão** e gravar no item o **preço efetivamente praticado**, junto com o preço de tabela da época.

Ainda **não definido** (não implementar regra antes da resposta):
- quem pode ajustar o preço no pedido (ADM, Financeiro ou ambos) e se há limite (P-PED-2);
- quais são os "fatores" (cliente, quantidade, forma de pagamento, frete…) e se o sistema deve calculá-los ou só registrar o preço digitado;
- se é preciso registrar o motivo do ajuste.

## Decisões técnicas
- **Permissões de clientes**: ADM e Financeiro cadastram e editam (P-CLI-1). Produtos e preços de tabela: só ADM.
- **Documento, telefone e CEP** são guardados só com números; a tela aplica a máscara.
- **Preço** em `DECIMAL(12,2)`, recebido e devolvido como texto (`"38.90"`). A tela aceita o padrão brasileiro (`1.041,50`) e converte o texto antes de enviar.
- **Histórico de preços**: cada mudança gera um registro `product.price_change` na auditoria (preço anterior, novo, quem e quando). A rota `GET /api/products/:id/price-history` lê esses registros. Não foi criada uma tabela separada porque a auditoria já guarda tudo o que é preciso.
- **Edição parcial segura**: na edição (`PATCH`), campo não enviado continua como estava; campo enviado vazio é apagado.
- **Busca**: clientes por nome ou CPF/CNPJ (com ou sem pontuação); produtos por nome, marca ou tipo. Listagens paginadas (50 por página) e filtro Ativos/Inativos/Todos.
