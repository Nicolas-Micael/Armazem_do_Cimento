import type { Request, Response } from "express";
import { parseQuery } from "../../middlewares/validate.js";
import * as ordersService from "./orders.service.js";
import { orderListQuerySchema } from "./orders.schemas.js";

export async function list(req: Request, res: Response) {
  res.json(await ordersService.listOrders(parseQuery(orderListQuerySchema, req.query)));
}

export async function get(req: Request<{ id: string }>, res: Response) {
  res.json({ order: await ordersService.getOrder(req.params.id) });
}

export async function preview(req: Request, res: Response) {
  res.json({ preview: await ordersService.previewOrder(req.body) });
}

export async function create(req: Request, res: Response) {
  const order = await ordersService.createOrder(req.auth!.user.id, req.body);
  res.status(201).json({ order });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const order = await ordersService.updateOrder(req.auth!.user.id, req.params.id, req.body);
  res.json({ order });
}

export async function confirm(req: Request<{ id: string }>, res: Response) {
  const order = await ordersService.confirmOrder(req.auth!.user.id, req.params.id, req.body);
  res.json({ order });
}
