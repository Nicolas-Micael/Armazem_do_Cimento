// Monta a aplicação Express: middlewares (na ordem em que rodam) e rotas.
//
// Fica separado de server.ts para que os testes possam usar o "app"
// sem precisar abrir uma porta de rede.
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";
import { customersRouter } from "./modules/customers/customers.routes.js";
import { productsRouter } from "./modules/products/products.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { paymentsRouter } from "./modules/payments/payments.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";

export function createApp() {
  const app = express();

  // Cabeçalhos HTTP de segurança (proteções padrão do navegador).
  app.use(helmet());

  // Só o nosso frontend pode chamar a API pelo navegador.
  // credentials: true permite enviar o cookie de sessão.
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));

  // Converte o corpo JSON das requisições em objeto (req.body).
  // O limite evita que alguém envie um corpo gigante.
  app.use(express.json({ limit: "100kb" }));

  // Lê os cookies da requisição (req.cookies), onde fica o código da sessão.
  app.use(cookieParser());

  // ---- Rotas da API ----
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api", paymentsRouter);
  app.use("/api/dashboard", dashboardRouter);
  // As próximas etapas adicionam aqui: /api/payments...

  // ---- Tratamento de rotas inexistentes e de erros (sempre por último) ----
  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  return app;
}
