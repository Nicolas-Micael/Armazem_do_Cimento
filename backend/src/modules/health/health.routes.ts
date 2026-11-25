// Rota de "saúde" da API: GET /api/health
//
// Serve para verificar rapidamente se o servidor está no ar e se ele
// consegue falar com o banco de dados. O serviço de hospedagem também
// usa esse tipo de rota para saber se a aplicação está funcionando.
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  let database: "ok" | "unavailable" = "ok";
  try {
    // Consulta mínima: só confirma que o banco responde.
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("Health check: banco indisponível.", error);
    database = "unavailable";
  }

  const healthy = database === "ok";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    database,
    time: new Date().toISOString(),
  });
});
