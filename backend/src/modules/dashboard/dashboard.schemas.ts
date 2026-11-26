import { z } from "zod";

const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use a data no formato AAAA-MM-DD." });

/** ?from=2026-11-01&to=2026-11-30 (sem parâmetros: do dia 1º do mês até hoje). */
export const dashboardQuerySchema = z.object({
  from: dateParam.optional(),
  to: dateParam.optional(),
});
