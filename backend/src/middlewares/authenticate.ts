// AUTENTICAÇÃO: "quem é você?"
//
// Lê o cookie de sessão, procura a sessão no banco e, se ela for válida,
// coloca o usuário em req.auth. Se não houver sessão válida, responde 401.
import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { PasswordChangeRequiredError, UnauthorizedError } from "../lib/errors.js";
import { hashSessionToken } from "../lib/tokens.js";

/** Nome do cookie que guarda o código da sessão. */
export const SESSION_COOKIE = "armazem_sessao";

export const authenticate: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length === 0) {
    throw new UnauthorizedError();
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });

  // A sessão precisa existir, não ter sido encerrada, não ter expirado,
  // e o usuário precisa continuar ativo.
  const now = new Date();
  if (!session || session.revokedAt || session.expiresAt <= now || !session.user.active) {
    throw new UnauthorizedError("Sua sessão expirou. Faça login novamente.");
  }

  const { user } = session;
  req.auth = {
    sessionId: session.id,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  };
  next();
};

/**
 * Bloqueia quem está com senha temporária. Essa pessoa só consegue usar
 * as rotas de "quem sou eu", troca de senha e logout até cadastrar uma
 * senha nova (decisão de 26/11/2026).
 */
export const requirePasswordChanged: RequestHandler = (req, _res, next) => {
  if (req.auth?.user.mustChangePassword) {
    throw new PasswordChangeRequiredError();
  }
  next();
};

/** Atalho usado na maioria das rotas: logado E com senha definitiva. */
export const requireAuth = [authenticate, requirePasswordChanged];
