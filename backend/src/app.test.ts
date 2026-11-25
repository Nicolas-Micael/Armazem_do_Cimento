// Testes da API (sobe o app em memória, sem abrir porta de rede).
// Precisa do PostgreSQL de teste rodando (ver README).
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/health", () => {
  it("responde ok quando o banco está acessível", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", database: "ok" });
  });
});

describe("tratamento de erros", () => {
  it("responde 404 em português para rota inexistente", async () => {
    const response = await request(app).get("/api/nao-existe");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("responde 400 para JSON malformado", async () => {
    const response = await request(app)
      .post("/api/health")
      .set("Content-Type", "application/json")
      .send("{ isto não é json");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
  });

  it("envia cabeçalhos de segurança (helmet)", async () => {
    const response = await request(app).get("/api/health");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });
});
