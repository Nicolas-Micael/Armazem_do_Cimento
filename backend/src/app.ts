// Monta a aplicação Express: middlewares (na ordem em que rodam) e rotas.
//
// Fica separado de server.ts para que os testes possam usar o "app"
// sem precisar abrir uma porta de rede.
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";

export function createApp() {
  const app = express();

  // Cabeçalhos HTTP de segurança (proteções padrão do navegador).
  app.use(helmet());

  // Só o nosso frontend pode chamar a API pelo navegador.
  // credentials: true permite enviar o cookie de sessão (etapa 2).
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));

  // Converte o corpo JSON das requisições em objeto (req.body).
  // O limite evita que alguém envie um corpo gigante.
  app.use(express.json({ limit: "100kb" }));

  // ---- Rotas da API ----
  app.use("/api/health", healthRouter);
  // As próximas etapas adicionam aqui: /api/auth, /api/users, /api/customers...

  // ---- Tratamento de rotas inexistentes e de erros (sempre por último) ----
  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  return app;
}
