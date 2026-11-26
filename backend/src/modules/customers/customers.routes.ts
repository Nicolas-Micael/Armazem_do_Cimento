// Rotas de clientes: /api/customers
//
// Permissões (decisão de Nicolas, 26/11/2026 — pergunta P-CLI-1):
// - consultar, cadastrar e editar (inclusive desativar): ADM e Financeiro.
import { Router } from "express";
import { requireAuth } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validateBody } from "../../middlewares/validate.js";
import * as controller from "./customers.controller.js";
import { createCustomerSchema, updateCustomerSchema } from "./customers.schemas.js";

/** Perfis que podem cadastrar e editar clientes. */
const CAN_MANAGE_CUSTOMERS = ["ADMIN", "FINANCEIRO"] as const;

export const customersRouter = Router();

customersRouter.use(...requireAuth);

customersRouter.get("/", controller.list);
customersRouter.get("/:id", controller.get);
customersRouter.post("/", authorize(...CAN_MANAGE_CUSTOMERS), validateBody(createCustomerSchema), controller.create);
customersRouter.patch("/:id", authorize(...CAN_MANAGE_CUSTOMERS), validateBody(updateCustomerSchema), controller.update);
