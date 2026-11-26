# 0005 — Clientes e produtos

**Data:** 26/11/2026 · **Situação:** implementado com decisões **provisórias** (aguardando P-CLI-1/2/3 e P-PRO-1/2/3)

## O que já estava definido
- ADM gerencia clientes e produtos; Financeiro consulta clientes e produtos (requisitos de 25/11/2026).
- Preço nunca fixo no código, cadastrável e editável; o preço praticado será copiado em cada pedido (etapa 5).
- Clientes e produtos nunca são apagados: são desativados. Produtos inativos não aparecem para novos pedidos, mas continuam no histórico.
- CPF/CNPJ é validado quando informado; evitar cadastro duplicado.

## Leituras provisórias (fáceis de mudar)
| Pergunta | Como ficou | Onde mudar |
|---|---|---|
| P-CLI-1 — Financeiro cadastra/edita clientes? | Não, só consulta | `CAN_MANAGE_CUSTOMERS` em `customers.routes.ts` (e o botão na tela) |
| P-CLI-2 — CPF/CNPJ obrigatório? | Opcional; se informado, validado e único | `documentSchema` em `customers.schemas.ts` |
| P-CLI-3 — Vários endereços por cliente? | Um endereço; o pedido terá endereço de entrega próprio | Exigiria uma tabela `customer_addresses` |
| P-PRO-1 — Só ADM altera preço? | Sim | `CAN_MANAGE_PRODUCTS` em `products.routes.ts` |
| P-PRO-2 — O que diferencia os produtos? | Nome, marca, tipo de cimento, peso do saco (kg), unidade "SACO" | `schema.prisma` (modelo `Product`) |
| P-PRO-3 — Preço por cliente/quantidade? | Não; preço único de tabela | — |

## Decisões técnicas
- **Documento, telefone e CEP** são guardados só com números; a tela aplica a máscara.
- **Preço** em `DECIMAL(12,2)`, recebido e devolvido como texto (`"38.90"`). A tela aceita o padrão brasileiro (`1.041,50`) e converte o texto antes de enviar.
- **Histórico de preços**: cada mudança gera um registro `product.price_change` na auditoria (preço anterior, novo, quem e quando). A rota `GET /api/products/:id/price-history` lê esses registros. Não foi criada uma tabela separada porque a auditoria já guarda tudo o que é preciso.
- **Edição parcial segura**: na edição (`PATCH`), campo não enviado continua como estava; campo enviado vazio é apagado.
- **Busca**: clientes por nome ou CPF/CNPJ (com ou sem pontuação); produtos por nome, marca ou tipo. Listagens paginadas (50 por página) e filtro Ativos/Inativos/Todos.
