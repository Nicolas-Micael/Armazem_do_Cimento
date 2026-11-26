// Rotas de autenticação: /api/auth
import { Router } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { authenticate } from "../../middlewares/authenticate.js";
import { validateBody } from "../../middlewares/validate.js";
import * as controller from "./auth.controller.js";
import { changePasswordSchema, loginSchema } from "./auth.schemas.js";

/**
 * Limite de tentativas de login ERRADAS: 10 a cada 15 minutos para a mesma
 * combinação de endereço IP + nome de usuário. Dificulta que alguém fique
 * testando senhas sem parar. Logins certos não contam.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}:${String(req.body?.username ?? "").toLowerCase()}`,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: "TOO_MANY_ATTEMPTS", message: "Muitas tentativas de login. Aguarde 15 minutos e tente novamente." },
    });
  },
});

export const authRouter = Router();

authRouter.post("/login", loginLimiter, validateBody(loginSchema), controller.login);

// As rotas abaixo exigem login, mas NÃO exigem senha definitiva:
// quem está com senha temporária precisa delas para trocá-la.
authRouter.post("/logout", authenticate, controller.logout);
authRouter.get("/me", authenticate, controller.me);
authRouter.post("/change-password", authenticate, validateBody(changePasswordSchema), controller.changePassword);
