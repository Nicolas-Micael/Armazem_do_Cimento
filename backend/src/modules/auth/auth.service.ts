// Regras de login, logout e troca de senha.
import { prisma } from "../../lib/prisma.js";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "../../lib/password.js";
import { generateSessionToken, hashSessionToken } from "../../lib/tokens.js";
import { UnauthorizedError, ValidationError } from "../../lib/errors.js";
import { env } from "../../config/env.js";
import { recordAudit } from "../audit/audit.service.js";
import { toPublicUser } from "../users/users.mapper.js";
import type { ChangePasswordInput, LoginInput } from "./auth.schemas.js";

/** Mensagem única para qualquer falha de login (não revela o que estava errado). */
const INVALID_LOGIN = "Usuário ou senha inválidos.";

/**
 * Confere usuário e senha e, se estiverem certos, abre uma sessão.
 * Retorna o código da sessão (vai para o cookie), a validade e o usuário.
 */
export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { username: input.username } });

  // Mesmo quando o usuário não existe, calculamos um hash (com o hash
  // "falso"), para a resposta demorar o mesmo tempo nos dois casos.
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordOk || !user.active) {
    throw new UnauthorizedError(INVALID_LOGIN);
  }

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.session.create({ data: { tokenHash: hashSessionToken(token), userId: user.id, expiresAt } });
    return tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  });

  return { token, expiresAt, user: toPublicUser(updated) };
}

/** Encerra a sessão atual (logout). */
export async function logout(sessionId: string) {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Dados do usuário logado (rota "quem sou eu"). */
export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toPublicUser(user);
}

/**
 * O próprio usuário troca a senha (obrigatório depois de uma senha temporária).
 * Efeitos: a troca obrigatória é liberada e as OUTRAS sessões dele são
 * encerradas (a sessão atual continua aberta).
 */
export async function changePassword(userId: string, currentSessionId: string, input: ChangePasswordInput) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new ValidationError("A senha atual está incorreta.", [
      { field: "currentPassword", message: "A senha atual está incorreta." },
    ]);
  }

  const passwordHash = await hashPassword(input.newPassword);

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    await tx.session.updateMany({
      where: { userId, revokedAt: null, id: { not: currentSessionId } },
      data: { revokedAt: new Date() },
    });
    await recordAudit(tx, { userId, action: "user.change_password", entityType: "user", entityId: userId });
    return changed;
  });

  return toPublicUser(updated);
}
