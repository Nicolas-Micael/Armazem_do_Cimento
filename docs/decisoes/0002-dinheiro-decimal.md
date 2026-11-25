# 0002 — Dinheiro sem ponto flutuante

**Data:** 25/11/2026 · **Situação:** aprovada (regra do `CLAUDE.md`); modo de arredondamento provisório

## Decisão
- No banco: colunas `DECIMAL(12,2)`.
- No backend: biblioteca `decimal.js` (a mesma usada pelo Prisma), funções em `backend/src/lib/money.ts`.
- Na API (JSON): valores em dinheiro trafegam como **texto**, ex. `"38.90"`.
- No frontend: formatação para `R$ 1.234,56` feita sobre o texto, sem converter para `number` (`frontend/src/lib/format.ts`).
- Arredondamento para 2 casas, "meio para cima", só no fim de cada cálculo. **Provisório** até a resposta da pergunta P-PED-5.

## Por quê
O tipo `number` do JavaScript é ponto flutuante binário: `0.1 + 0.2` vale `0.30000000000000004`. Em somas de pedidos e pagamentos isso gera diferenças de centavos.
