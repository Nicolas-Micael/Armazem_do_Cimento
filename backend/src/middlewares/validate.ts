// Confere o formato do corpo da requisição usando um schema do Zod.
//
// Se os dados estiverem certos, req.body é SUBSTITUÍDO pela versão
// validada e normalizada (ex.: nome de usuário em minúsculas, espaços
// removidos). Se estiverem errados, responde 400 com a lista de campos.
import type { RequestHandler } from "express";
import type { z } from "zod";
import { ValidationError } from "../lib/errors.js";

export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      throw new ValidationError("Dados inválidos. Confira os campos destacados.", details);
    }
    req.body = result.data;
    next();
  };
}
