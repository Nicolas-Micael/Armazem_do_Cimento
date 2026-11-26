// Converte o usuário do banco no formato enviado pela API.
// Existe para garantir que o hash da senha NUNCA saia do servidor.
import type { User } from "../../generated/prisma/client.js";

export function toPublicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
