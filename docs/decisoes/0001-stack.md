# 0001 — Stack tecnológico

**Data:** 25/11/2026 · **Situação:** aprovada por Nicolas

## Decisão
- Frontend: React + TypeScript, com Vite.
- Backend: Node.js + TypeScript, com Express.
- Banco: PostgreSQL.
- ORM: Prisma (versão 7, com o adaptador `@prisma/adapter-pg`).
- Testes: Vitest (e Supertest para rotas da API).
- Um único repositório com `backend/`, `frontend/` e `docs/`.

## Por quê
TypeScript nas duas pontas permite aprender uma linguagem só e pega erros de tipo antes de rodar. PostgreSQL é relacional, confiável e tem tipo `DECIMAL` exato para dinheiro. O Prisma gera consultas tipadas e mantém o histórico de mudanças do banco em migrations.

## Consequências
Trocar qualquer item acima exige justificativa e autorização (ver `CLAUDE.md`).
