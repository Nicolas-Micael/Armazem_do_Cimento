// Regras de negócio da gestão de usuários (só o ADM chega aqui; a
// permissão é conferida nas rotas).
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/password.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { recordAudit } from "../audit/audit.service.js";
import { toPublicUser } from "./users.mapper.js";
import type { CreateUserInput, ResetPasswordInput, UpdateUserInput } from "./users.schemas.js";

/** Lista todos os usuários, ativos primeiro, em ordem alfabética. */
export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  return users.map(toPublicUser);
}

/**
 * Cria um usuário com senha TEMPORÁRIA. No primeiro acesso ele será
 * obrigado a cadastrar uma senha nova (mustChangePassword = true).
 */
export async function createUser(actorId: string, input: CreateUserInput) {
  const passwordHash = await hashPassword(input.temporaryPassword);

  try {
    // Transação: o usuário e o registro de auditoria são gravados juntos.
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          username: input.username,
          role: input.role,
          passwordHash,
          mustChangePassword: true,
        },
      });
      await recordAudit(tx, {
        userId: actorId,
        action: "user.create",
        entityType: "user",
        entityId: created.id,
        after: { name: created.name, username: created.username, role: created.role },
      });
      return created;
    });
    return toPublicUser(user);
  } catch (error) {
    // P2002 é o código do Prisma para "valor único repetido".
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError(`O nome de usuário "${input.username}" já está em uso.`);
    }
    throw error;
  }
}

/**
 * Altera nome, perfil ou situação (ativo/inativo) de um usuário.
 *
 * Proteções para o sistema nunca ficar sem administrador:
 * - o ADM não pode desativar a si mesmo nem tirar o próprio perfil de ADM;
 * - o último ADM ativo não pode ser desativado nem rebaixado.
 * Ao desativar alguém, todas as sessões dessa pessoa são encerradas.
 */
export async function updateUser(actorId: string, userId: string, input: UpdateUserInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: userId } });
    if (!current) throw new NotFoundError("Usuário não encontrado.");

    const losesAdmin =
      current.role === "ADMIN" &&
      current.active &&
      ((input.role !== undefined && input.role !== "ADMIN") || input.active === false);

    if (losesAdmin && userId === actorId) {
      throw new ConflictError("Você não pode desativar nem remover o perfil de ADM da sua própria conta.");
    }
    // Defesa extra: em condições normais a regra acima já impede, mas esta
    // checagem garante que nunca sobre zero ADMs ativos.
    if (losesAdmin) {
      const activeAdmins = await tx.user.count({ where: { role: "ADMIN", active: true } });
      if (activeAdmins <= 1) {
        throw new ConflictError("Este é o último ADM ativo. Cadastre outro ADM antes.");
      }
    }

    const updated = await tx.user.update({ where: { id: userId }, data: input });

    if (current.active && updated.active === false) {
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await recordAudit(tx, {
      userId: actorId,
      action: "user.update",
      entityType: "user",
      entityId: userId,
      before: { name: current.name, role: current.role, active: current.active },
      after: { name: updated.name, role: updated.role, active: updated.active },
    });

    return toPublicUser(updated);
  });
}

/**
 * O ADM define uma senha temporária para outro usuário (ex.: esqueceu a senha).
 * Efeitos: a pessoa é desconectada de todos os aparelhos e, no próximo
 * acesso, precisa cadastrar uma senha nova.
 */
export async function resetPassword(actorId: string, userId: string, input: ResetPasswordInput) {
  const passwordHash = await hashPassword(input.temporaryPassword);

  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: userId } });
    if (!current) throw new NotFoundError("Usuário não encontrado.");

    const updated = await tx.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true },
    });
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    // A auditoria registra QUE a senha foi redefinida, nunca a senha.
    await recordAudit(tx, {
      userId: actorId,
      action: "user.reset_password",
      entityType: "user",
      entityId: userId,
    });

    return toPublicUser(updated);
  });
}
