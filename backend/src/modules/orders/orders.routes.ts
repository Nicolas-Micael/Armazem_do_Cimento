// Rotas de pedidos: /api/orders
// ADM e Financeiro podem consultar, criar e editar pedidos pendentes.
import { Router } from "express";
import { requireAuth } from "../../middlewares/authenticate.js";
import { validateBody } from "../../middlewares/validate.js";
import * as controller from "./orders.controller.js";
import { createOrderSchema, previewOrderSchema, updateOrderSchema } from "./orders.schemas.js";

export const ordersRouter = Router();

ordersRouter.use(...requireAuth);

ordersRouter.get("/", controller.list);
// "/preview" vem antes de "/:id" para não ser confundido com um id.
ordersRouter.post("/preview", validateBody(previewOrderSchema), controller.preview);
ordersRouter.get("/:id", controller.get);
ordersRouter.post("/", validateBody(createOrderSchema), controller.create);
ordersRouter.put("/:id", validateBody(updateOrderSchema), controller.update);
