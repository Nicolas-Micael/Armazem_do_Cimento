# Armazém do Cimento — Sistema de Pedidos

Sistema interno de controle de pedidos, clientes, pagamentos e recebimentos.

- Regras do projeto: [`CLAUDE.md`](CLAUDE.md)
- Planejamento e perguntas em aberto: [`docs/planejamento-arquitetura.md`](docs/planejamento-arquitetura.md)
- Decisões técnicas: [`docs/decisoes/`](docs/decisoes/)

## Estado atual

**Etapa 1 (esqueleto) concluída.** O backend responde em `/api/health`, conecta ao PostgreSQL e tem a tabela de usuários. O frontend mostra uma tela que confere essa conexão. Ainda não há login, pedidos nem pagamentos.

## Estrutura

```
backend/    API Node.js + Express + TypeScript + Prisma
frontend/   Interface React + TypeScript (Vite)
docs/       Planejamento e decisões técnicas
```

## Como rodar no seu computador

Pré-requisitos: **Node.js 22 ou mais novo** e **Docker** (ou PostgreSQL 16 instalado).

```bash
# 1. Subir o PostgreSQL local (cria os bancos armazem_dev e armazem_test)
docker compose up -d

# 2. Backend
cd backend
npm install
cp .env.example .env          # no Windows: copy .env.example .env
npm run db:generate           # gera o cliente do Prisma (código para acessar o banco)
npm run db:migrate            # cria as tabelas no banco de desenvolvimento
npm run dev                   # API em http://localhost:3333

# 3. Frontend (em outro terminal)
cd frontend
npm install
npm run dev                   # abra http://localhost:5173
```

Se tudo estiver certo, a tela mostra "API: funcionando" e "Banco de dados: conectado".

## Testes

```bash
# Backend (precisa do banco de testes com as migrations aplicadas)
cd backend
DATABASE_URL="postgresql://armazem:armazem_dev@localhost:5432/armazem_test?schema=public" npx prisma migrate deploy
npm test

# Frontend
cd frontend
npm test
```

## Comandos úteis do backend

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe a API e reinicia sozinha a cada alteração |
| `npm run typecheck` | Confere os tipos TypeScript sem gerar arquivos |
| `npm test` | Roda os testes |
| `npm run db:migrate` | Cria uma migration a partir do `schema.prisma` e aplica no banco local |
| `npm run db:studio` | Abre uma tela para ver os dados do banco local |
