// Rotas do painel: /api/dashboard (ADM e Financeiro).
import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth } from "../../middlewares/authenticate.js";
import { parseQuery } from "../../middlewares/validate.js";
import { dashboardQuerySchema } from "./dashboard.schemas.js";
import { getDashboard } from "./dashboard.service.js";

export const dashboardRouter = Router();

dashboardRouter.use(...requireAuth);

dashboardRouter.get("/", async (req: Request, res: Response) => {
  res.json(await getDashboard(parseQuery(dashboardQuerySchema, req.query)));
});
