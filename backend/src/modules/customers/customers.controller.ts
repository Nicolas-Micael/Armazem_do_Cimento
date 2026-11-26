import type { Request, Response } from "express";
import { parseQuery } from "../../middlewares/validate.js";
import { listQuerySchema } from "../../lib/schemas.js";
import * as customersService from "./customers.service.js";

export async function list(req: Request, res: Response) {
  const query = parseQuery(listQuerySchema, req.query);
  res.json(await customersService.listCustomers(query));
}

export async function get(req: Request<{ id: string }>, res: Response) {
  res.json({ customer: await customersService.getCustomer(req.params.id) });
}

export async function create(req: Request, res: Response) {
  const customer = await customersService.createCustomer(req.auth!.user.id, req.body);
  res.status(201).json({ customer });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const customer = await customersService.updateCustomer(req.auth!.user.id, req.params.id, req.body);
  res.json({ customer });
}
