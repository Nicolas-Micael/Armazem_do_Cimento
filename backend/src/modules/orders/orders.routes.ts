// Rotas de pedidos: /api/orders
// ADM e Financeiro podem consultar, criar e editar pedidos pendentes.
import { Router } from "express";
import { requireAuth } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validateBody } from "../../middlewares/validate.js";
import * as controller from "./orders.controller.js";
import { confirmOrderSchema, createOrderSchema, previewOrderSchema, updateOrderSchema } from "./orders.schemas.js";

export const ordersRouter = Router();

ordersRouter.use(...requireAuth);

ordersRouter.get("/", controller.list);
// "/preview" vem antes de "/:id" para não ser confundido com um id.
ordersRouter.post("/preview", validateBody(previewOrderSchema), controller.preview);
ordersRouter.get("/:id", controller.get);
// Histórico de alterações (quem mudou o quê e quando), a partir da auditoria.
ordersRouter.get("/:id/history", controller.history);
ordersRouter.post("/", validateBody(createOrderSchema), controller.create);
ordersRouter.put("/:id", validateBody(updateOrderSchema), controller.update);
// Só o ADM confirma uma saída (decisão do Nicolas, 26/11/2026). O Financeiro apenas consulta.
ordersRouter.post("/:id/confirm", authorize("ADMIN"), validateBody(confirmOrderSchema), controller.confirm);
