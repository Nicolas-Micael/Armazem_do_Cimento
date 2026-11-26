# 0004 — Autenticação, sessões e perfis

**Data:** 26/11/2026 · **Situação:** aprovada por Nicolas (itens marcados como provisórios dependem de confirmação)

## Regras de negócio decididas
- Login por **nome de usuário** (não por e-mail). O nome é guardado sempre em minúsculas.
- Não há recuperação de senha por e-mail. O **ADM redefine** a senha de outro usuário, definindo uma **senha temporária**.
- Quem entra com senha temporária (usuário novo ou senha redefinida) é **obrigado a cadastrar uma senha nova** antes de usar qualquer outra função.
- Apenas dois perfis: `ADMIN` e `FINANCEIRO`. A gestão de usuários é exclusiva do ADM.

## Decisões técnicas
| Assunto | Escolha | Por quê |
|---|---|---|
| Hash de senha | `scrypt` do módulo `node:crypto` (`backend/src/lib/password.ts`) | Algoritmo lento de propósito, recomendado para senhas, e já vem no Node (sem dependência extra) |
| Sessão | Tabela `sessions` no banco + cookie `armazem_sessao` com um código aleatório | Dá para encerrar a sessão de alguém na hora (logout, desativação, redefinição de senha) |
| Código da sessão | O banco guarda só o **hash SHA-256** do código | Se a tabela vazar, os valores não servem para entrar no sistema |
| Cookie | `httpOnly`, `SameSite=Lax`, `Secure` em produção | Scripts da página não leem o cookie; outros sites não conseguem usá-lo |
| Limite de tentativas | 10 logins errados a cada 15 min por IP + usuário (`express-rate-limit`) | Dificulta adivinhar senhas |
| Mensagem de erro do login | Sempre "Usuário ou senha inválidos." e o mesmo tempo de resposta | Não revela quais nomes de usuário existem |
| Permissões | Middlewares `authenticate`, `requirePasswordChanged` e `authorize(...)` no backend | A tela só esconde menus; quem bloqueia é o servidor |
| Auditoria | Tabela `audit_logs`: criação, edição, redefinição e troca de senha | Rastreabilidade; senhas e hashes nunca são registrados |

## Proteções extras (não são regras de negócio, evitam travar o sistema)
- O ADM não pode desativar a própria conta nem retirar o próprio perfil de ADM.
- O sistema nunca fica sem nenhum ADM ativo.
- Desativar um usuário encerra imediatamente as sessões dele.
- Trocar a própria senha encerra as sessões nos outros aparelhos.

## Provisórios (ajustáveis)
- Sessão expira em **8 horas** (`SESSION_TTL_HOURS` no `.env`) — pergunta P-USU-3.
- Senha com no mínimo **8 caracteres** (`backend/src/modules/users/users.schemas.ts`).
- O nome de usuário não pode ser alterado depois de criado (para manter a auditoria clara). Se precisar, criar outro usuário e desativar o antigo.
