// AUTORIZAÇÃO: "seu perfil pode fazer isto?"
//
// Deve vir DEPOIS do authenticate. Exemplo de uso numa rota:
//   router.post("/", ...requireAuth, authorize("ADMIN"), controller.create)
//
// Esta checagem acontece no servidor. Esconder um botão na tela não basta,
// porque qualquer pessoa pode chamar a API diretamente.
import type { RequestHandler } from "express";
import type { Role } from "../generated/prisma/client.js";
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js";

export function authorize(...allowedRoles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw new UnauthorizedError();
    if (!allowedRoles.includes(req.auth.user.role)) throw new ForbiddenError();
    next();
  };
}
