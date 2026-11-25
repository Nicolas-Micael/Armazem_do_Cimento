# 0003 — Ambiente de desenvolvimento local

**Data:** 25/11/2026 · **Situação:** proposta (depende da pergunta P-INF-1)

## Decisão
- PostgreSQL local via Docker Compose (`docker-compose.yml` na raiz), com dois bancos: `armazem_dev` (desenvolvimento) e `armazem_test` (testes automáticos).
- Quem não puder usar Docker pode instalar o PostgreSQL 16 diretamente e criar os mesmos bancos.
- Em desenvolvimento, o Vite repassa as chamadas `/api` para o backend (porta 3333), então frontend e API parecem estar no mesmo endereço.

## Por quê
O banco local é igual ao de produção (PostgreSQL), pode ser recriado a qualquer momento e nunca contém dados reais de clientes. Os testes usam um banco separado para não bagunçar os dados de desenvolvimento.
