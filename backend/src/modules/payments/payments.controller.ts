import type { Request, Response } from "express";
import * as service from "./payments.service.js";

export async function listForOrder(req: Request<{ id: string }>, res: Response) {
  res.json(await service.getOrderPayments(req.params.id));
}

export async function create(req: Request<{ id: string }>, res: Response) {
  const payment = await service.registerPayment(req.auth!.user.id, req.params.id, req.body);
  res.status(201).json({ payment });
}

export async function setDueDates(req: Request<{ id: string }>, res: Response) {
  res.json(await service.setDueDates(req.auth!.user.id, req.params.id, req.body));
}

export async function confirm(req: Request<{ id: string }>, res: Response) {
  res.json({ payment: await service.confirmPayment(req.auth!.user.id, req.params.id, req.body) });
}

export async function clear(req: Request<{ id: string }>, res: Response) {
  res.json({ payment: await service.clearCheck(req.auth!.user.id, req.params.id, req.body) });
}

export async function reverse(req: Request<{ id: string }>, res: Response) {
  res.json({ payment: await service.reversePayment(req.auth!.user.id, req.params.id, req.body) });
}

export async function accounts(_req: Request, res: Response) {
  res.json({ accounts: await service.listReceivingAccounts() });
}
