// Testes de produtos: preço em decimal, histórico de preço e permissões.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestUser, loginAs, resetDatabase } from "../../../tests/helpers.js";

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const cpII = { name: "Cimento CP II-E-32 50kg", brand: "Marca A", cementType: "CP II-E-32", currentPrice: "38.9" };

async function setup() {
  await createTestUser({ username: "chefe", role: "ADMIN" });
  await createTestUser({ username: "caixa1", role: "FINANCEIRO" });
  return { admin: await loginAs(app, "chefe"), financeiro: await loginAs(app, "caixa1") };
}

describe("cadastro de produtos", () => {
  it("ADM cadastra; preço volta como texto com 2 casas e unidade SACO", async () => {
    const { admin } = await setup();
    const response = await admin.post("/api/products").send(cpII);

    expect(response.status).toBe(201);
    expect(response.body.product).toMatchObject({ currentPrice: "38.90", unit: "SACO", active: true });
    expect(response.body.product).not.toHaveProperty("bagWeightKg");
  });

  it("guarda o preço exato no banco (DECIMAL), sem erro de arredondamento", async () => {
    const { admin } = await setup();
    const { body } = await admin.post("/api/products").send({ ...cpII, currentPrice: "0.10" });
    const row = await prisma.$queryRaw<{ price: string }[]>`
      SELECT current_price::text AS price FROM products WHERE id = ${body.product.id}`;
    expect(row[0]?.price).toBe("0.10");
  });

  it("recusa preço como número, com vírgula, com 3 casas, zero ou negativo", async () => {
    const { admin } = await setup();
    for (const currentPrice of [38.9, "38,90", "38.901", "0", "0.00", "-1"]) {
      const response = await admin.post("/api/products").send({ ...cpII, currentPrice });
      expect(response.status, `preço ${JSON.stringify(currentPrice)}`).toBe(400);
    }
  });
});

describe("alteração de preço", () => {
  it("registra o histórico de preços (antes e depois, quem e quando)", async () => {
    const { admin } = await setup();
    const { body } = await admin.post("/api/products").send(cpII);
    const id = body.product.id;

    await admin.patch(`/api/products/${id}`).send({ currentPrice: "41.50" });
    await admin.patch(`/api/products/${id}`).send({ name: "Cimento CP II 50 kg" }); // não muda preço
    await admin.patch(`/api/products/${id}`).send({ currentPrice: "41.5" }); // mesmo valor: não é mudança

    const history = (await admin.get(`/api/products/${id}/price-history`)).body.history;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ previousPrice: "38.90", newPrice: "41.50", changedBy: "Teste chefe" });
    expect(history[1]).toMatchObject({ previousPrice: null, newPrice: "38.90" }); // cadastro
  });

  it("edição parcial mantém os campos não enviados", async () => {
    const { admin } = await setup();
    const { body } = await admin.post("/api/products").send(cpII);
    const response = await admin.patch(`/api/products/${body.product.id}`).send({ currentPrice: "40.00" });
    expect(response.body.product).toMatchObject({ brand: "Marca A", cementType: "CP II-E-32", currentPrice: "40.00" });
  });

  it("produto desativado sai da lista padrão, mas continua consultável", async () => {
    const { admin } = await setup();
    const { body } = await admin.post("/api/products").send(cpII);
    await admin.patch(`/api/products/${body.product.id}`).send({ active: false });

    expect((await admin.get("/api/products")).body.total).toBe(0);
    expect((await admin.get(`/api/products/${body.product.id}`)).body.product.active).toBe(false);
  });
});

describe("busca", () => {
  it("encontra por nome, marca ou tipo", async () => {
    const { admin } = await setup();
    await admin.post("/api/products").send(cpII);
    await admin.post("/api/products").send({ name: "Cimento CP V-ARI 40kg", brand: "Marca B", cementType: "CP V-ARI", currentPrice: "45.00" });

    expect((await admin.get("/api/products").query({ search: "marca b" })).body.total).toBe(1);
    expect((await admin.get("/api/products").query({ search: "cp ii" })).body.total).toBe(1);
    expect((await admin.get("/api/products").query({ search: "cimento" })).body.total).toBe(2);
  });
});

describe("permissões (provisório, P-PRO-1)", () => {
  it("Financeiro consulta produtos e histórico, mas não cadastra nem altera preço", async () => {
    const { admin, financeiro } = await setup();
    const { body } = await admin.post("/api/products").send(cpII);
    const id = body.product.id;

    expect((await financeiro.get("/api/products")).status).toBe(200);
    expect((await financeiro.get(`/api/products/${id}/price-history`)).status).toBe(200);
    expect((await financeiro.post("/api/products").send(cpII)).status).toBe(403);
    expect((await financeiro.patch(`/api/products/${id}`).send({ currentPrice: "1.00" })).status).toBe(403);
    expect((await prisma.product.findUniqueOrThrow({ where: { id } })).currentPrice.toFixed(2)).toBe("38.90");
  });
});
