// Middleware de tratamento de erros.
//
// No Express, um middleware com QUATRO parâmetros (err, req, res, next)
// é chamado sempre que alguma rota lança um erro. Ele é registrado por
// último em app.ts e decide o que o usuário recebe como resposta.
import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError, ValidationError } from "../lib/errors.js";

/** Responde 404 para endereços da API que não existem. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: "ROUTE_NOT_FOUND", message: `Rota não encontrada: ${req.method} ${req.originalUrl}` },
  });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // 1. Erros previstos pela aplicação: mensagem clara e código adequado.
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err instanceof ValidationError && err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // 2. JSON malformado enviado pelo cliente (erro do express.json()).
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "O corpo da requisição não é um JSON válido." } });
    return;
  }

  // 3. Erro inesperado (bug). Registramos no log do servidor para
  //    investigação e devolvemos uma mensagem genérica, sem expor
  //    detalhes internos (que podem conter dados sensíveis).
  console.error("Erro inesperado:", err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Erro interno no servidor." } });
};
