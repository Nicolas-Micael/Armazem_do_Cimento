// Confere o formato dos dados da requisição usando schemas do Zod.
//
// Se os dados estiverem certos, a versão validada e normalizada (ex.:
// espaços removidos, letras minúsculas) substitui a original. Se
// estiverem errados, responde 400 com a lista de campos.
import type { RequestHandler } from "express";
import type { z } from "zod";
import { ValidationError } from "../lib/errors.js";

function toValidationError(error: z.ZodError): ValidationError {
  const details = error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
  return new ValidationError("Dados inválidos. Confira os campos destacados.", details);
}

/** Valida o corpo (JSON) da requisição e substitui req.body pela versão validada. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) throw toValidationError(result.error);
    req.body = result.data;
    next();
  };
}

/**
 * Valida os parâmetros da URL (?search=...&page=...). No Express 5,
 * req.query não pode ser substituído, então a versão validada é
 * devolvida para o controller usar.
 */
export function parseQuery<T extends z.ZodType>(schema: T, query: unknown): z.infer<T> {
  const result = schema.safeParse(query);
  if (!result.success) throw toValidationError(result.error);
  return result.data;
}
