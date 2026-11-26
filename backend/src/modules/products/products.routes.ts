// Rotas de produtos: /api/products
//
// Permissões (decisão provisória, pergunta P-PRO-1):
// - consultar (inclusive histórico de preços): ADM e Financeiro;
// - cadastrar, editar, alterar preço e desativar: só ADM.
import { Router } from "express";
import { requireAuth } from "../../middlewares/authenticate.js";
import { authorize } from "../../middlewares/authorize.js";
import { validateBody } from "../../middlewares/validate.js";
import * as controller from "./products.controller.js";
import { createProductSchema, updateProductSchema } from "./products.schemas.js";

/** Perfis que podem cadastrar produtos e alterar preços. Ajustar aqui se P-PRO-1 mudar. */
const CAN_MANAGE_PRODUCTS = ["ADMIN"] as const;

export const productsRouter = Router();

productsRouter.use(...requireAuth);

productsRouter.get("/", controller.list);
productsRouter.get("/:id", controller.get);
productsRouter.get("/:id/price-history", controller.priceHistory);
productsRouter.post("/", authorize(...CAN_MANAGE_PRODUCTS), validateBody(createProductSchema), controller.create);
productsRouter.patch("/:id", authorize(...CAN_MANAGE_PRODUCTS), validateBody(updateProductSchema), controller.update);
