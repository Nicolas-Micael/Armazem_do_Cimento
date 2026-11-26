import type { Request, Response } from "express";
import { parseQuery } from "../../middlewares/validate.js";
import { listQuerySchema } from "../../lib/schemas.js";
import * as productsService from "./products.service.js";

export async function list(req: Request, res: Response) {
  const query = parseQuery(listQuerySchema, req.query);
  res.json(await productsService.listProducts(query));
}

export async function get(req: Request<{ id: string }>, res: Response) {
  res.json({ product: await productsService.getProduct(req.params.id) });
}

export async function priceHistory(req: Request<{ id: string }>, res: Response) {
  res.json({ history: await productsService.getPriceHistory(req.params.id) });
}

export async function create(req: Request, res: Response) {
  const product = await productsService.createProduct(req.auth!.user.id, req.body);
  res.status(201).json({ product });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const product = await productsService.updateProduct(req.auth!.user.id, req.params.id, req.body);
  res.json({ product });
}
