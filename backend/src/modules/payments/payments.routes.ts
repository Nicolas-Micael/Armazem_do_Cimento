// Rotas de pagamentos. Montado em /api (os caminhos já trazem o prefixo).
//
// ADM e Financeiro podem registrar, confirmar, compensar e estornar (decisão 6).
// A autorização é conferida aqui, no servidor, em cada rota.
import { Router } from "express";
import { requireAuth } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validateBody } from "../../middlewares/validate.js";
import * as controller from "./payments.controller.js";
import { clearCheckSchema, confirmPaymentSchema, createPaymentSchema, reversePaymentSchema, setDueDatesSchema } from "./payments.schemas.js";

export const paymentsRouter = Router();

// requireAuth em cada rota (e não em router.use) para não atingir outras rotas de /api.
const access = [...requireAuth, authorize("ADMIN", "FINANCEIRO")];

paymentsRouter.get("/receiving-accounts", ...access, controller.accounts);
paymentsRouter.get("/orders/:id/payments", ...access, controller.listForOrder);
paymentsRouter.post("/orders/:id/payments", ...access, validateBody(createPaymentSchema), controller.create);
paymentsRouter.put("/orders/:id/due-dates", ...access, validateBody(setDueDatesSchema), controller.setDueDates);
paymentsRouter.post("/payments/:id/confirm", ...access, validateBody(confirmPaymentSchema), controller.confirm);
paymentsRouter.post("/payments/:id/clear", ...access, validateBody(clearCheckSchema), controller.clear);
paymentsRouter.post("/payments/:id/reverse", ...access, validateBody(reversePaymentSchema), controller.reverse);
