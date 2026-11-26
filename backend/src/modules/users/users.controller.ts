// Controllers: traduzem a requisição HTTP numa chamada ao service e
// devolvem a resposta. Não contêm regra de negócio.
import type { Request, Response } from "express";
import * as usersService from "./users.service.js";

// req.auth! — o "!" diz ao TypeScript que req.auth existe. É seguro porque
// estas funções só rodam depois do middleware authenticate (ver as rotas).

export async function list(_req: Request, res: Response) {
  res.json({ users: await usersService.listUsers() });
}

export async function create(req: Request, res: Response) {
  const user = await usersService.createUser(req.auth!.user.id, req.body);
  res.status(201).json({ user });
}

export async function update(req: Request<{ id: string }>, res: Response) {
  const user = await usersService.updateUser(req.auth!.user.id, req.params.id, req.body);
  res.json({ user });
}

export async function resetPassword(req: Request<{ id: string }>, res: Response) {
  const user = await usersService.resetPassword(req.auth!.user.id, req.params.id, req.body);
  res.json({ user });
}
