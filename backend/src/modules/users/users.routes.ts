// Rotas de usuários: /api/users — TODAS exclusivas do perfil ADM.
import { Router } from "express";
import { requireAuth } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validateBody } from "../../middlewares/validate.js";
import * as controller from "./users.controller.js";
import { createUserSchema, resetPasswordSchema, updateUserSchema } from "./users.schemas.js";

export const usersRouter = Router();

// Vale para todas as rotas abaixo: precisa estar logado, com senha
// definitiva, e ter o perfil ADMIN.
usersRouter.use(...requireAuth, authorize("ADMIN"));

usersRouter.get("/", controller.list);
usersRouter.post("/", validateBody(createUserSchema), controller.create);
usersRouter.patch("/:id", validateBody(updateUserSchema), controller.update);
usersRouter.post("/:id/reset-password", validateBody(resetPasswordSchema), controller.resetPassword);
