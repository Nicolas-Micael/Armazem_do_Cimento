# Armazém do Cimento — Sistema de Pedidos

Sistema interno de controle de pedidos, clientes, pagamentos e recebimentos.

- Regras do projeto: [`CLAUDE.md`](CLAUDE.md)
- Planejamento e perguntas em aberto: [`docs/planejamento-arquitetura.md`](docs/planejamento-arquitetura.md)
- Decisões técnicas: [`docs/decisoes/`](docs/decisoes/)

## Estado atual

- **Etapa 1 (esqueleto):** concluída. API, banco e tela de verificação.
- **Etapa 2 (login e permissões):** login por nome de usuário, senha temporária com troca obrigatória, perfis ADM e Financeiro, gestão de usuários pelo ADM e auditoria. Detalhes em [`docs/decisoes/0004-autenticacao.md`](docs/decisoes/0004-autenticacao.md).

Ainda não há clientes, produtos, pedidos nem pagamentos.

## Estrutura

```
backend/    API Node.js + Express + TypeScript + Prisma
frontend/   Interface React + TypeScript (Vite)
docs/       Planejamento e decisões técnicas
```

## Como rodar no seu computador (Windows)

Pré-requisitos: **Node.js 22 ou mais novo** e **Docker Desktop** (com WSL 2). Os comandos abaixo são para o PowerShell, dentro da pasta do projeto.

```powershell
# 1. Subir o PostgreSQL local (cria os bancos armazem_dev e armazem_test)
docker compose up -d

# 2. Backend
cd backend
npm install
copy .env.example .env        # depois abra o .env e preencha SEED_ADMIN_PASSWORD
npm run db:generate           # gera o cliente do Prisma (código para acessar o banco)
npm run db:migrate            # cria as tabelas no banco de desenvolvimento
npm run db:seed               # cria o primeiro ADM com os dados SEED_ADMIN_* do .env
npm run dev                   # API em http://localhost:3333

# 3. Frontend (em outro terminal)
cd frontend
npm install
npm run dev                   # abra http://localhost:5173
```

Entre com o usuário e a senha definidos em `SEED_ADMIN_USERNAME` e `SEED_ADMIN_PASSWORD`. No primeiro acesso o sistema pede uma senha nova. Depois, em **Usuários**, o ADM cadastra os demais.

> No macOS ou Linux, troque `copy` por `cp`.

## Testes

```powershell
# Backend: aplica as migrations no banco de TESTE e roda os testes
cd backend
npm run test:db:prepare
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
| `npm run db:seed` | Cria o primeiro ADM (só se ainda não existir nenhum) |
| `npm run db:studio` | Abre uma tela para ver os dados do banco local |
