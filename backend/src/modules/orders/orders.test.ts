// Testes de pedidos: criação, cópia de preço, cálculo no backend,
// edição de pendentes, conflito de versão e auditoria.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestUser, loginAs, resetDatabase } from "../../../tests/helpers.js";

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function setup() {
  await createTestUser({ username: "chefe", role: "ADMIN" });
  await createTestUser({ username: "caixa1", role: "FINANCEIRO" });
  const customer = await prisma.customer.create({ data: { name: "Construtora Exemplo", document: "11222333000181" } });
  const cpII = await prisma.product.create({ data: { name: "Cimento CP II 50kg", currentPrice: "38.90" } });
  const cpV = await prisma.product.create({ data: { name: "Cimento CP V 40kg", currentPrice: "45.15" } });
  return {
    customer,
    cpII,
    cpV,
    admin: await loginAs(app, "chefe"),
    financeiro: await loginAs(app, "caixa1"),
  };
}

function baseOrder(customerId: string, productId: string) {
  return {
    customerId,
    items: [{ productId, quantity: 40 }],
    freightAmount: "120.00",
    paymentTerm: "TERM_15_DAYS",
    deliveryMode: "DELIVERY",
    deliveryAddress: "Rua das Obras, 100 - Centro",
    expectedDeliveryDate: "2026-11-30",
  };
}

describe("criar pedido", () => {
  it("Financeiro cria pedido pendente; preço de tabela é copiado e o total é calculado no backend", async () => {
    const { customer, cpII, financeiro } = await setup();
    const response = await financeiro.post("/api/orders").send(baseOrder(customer.id, cpII.id));

    expect(response.status).toBe(201);
    const order = response.body.order;
    expect(order).toMatchObject({
      code: "PED-000001",
      status: "PENDING",
      customerName: "Construtora Exemplo",
      subtotal: "1556.00",
      freightAmount: "120.00",
      discountAmount: "0.00",
      total: "1676.00",
      paymentTerm: "TERM_15_DAYS",
      expectedDeliveryDate: "2026-11-30",
      createdBy: "Teste caixa1",
      version: 1,
    });
    expect(order.items[0]).toMatchObject({ quantity: 40, catalogUnitPrice: "38.90", unitPrice: "38.90", lineTotal: "1556.00" });
    expect(order.statusHistory).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: "PENDING", changedBy: "Teste caixa1" }),
    ]);
  });

  it("aceita preço diferente do de tabela e guarda os dois", async () => {
    const { customer, cpII, admin } = await setup();
    const response = await admin
      .post("/api/orders")
      .send({ ...baseOrder(customer.id, cpII.id), items: [{ productId: cpII.id, quantity: 10, unitPrice: "36.50" }] });

    expect(response.body.order.items[0]).toMatchObject({ catalogUnitPrice: "38.90", unitPrice: "36.50", lineTotal: "365.00" });
  });

  it("ignora qualquer total enviado pela tela: o backend sempre recalcula", async () => {
    const { customer, cpII, admin } = await setup();
    const response = await admin
      .post("/api/orders")
      .send({ ...baseOrder(customer.id, cpII.id), total: "1.00", subtotal: "1.00" });
    expect(response.body.order.total).toBe("1676.00");
  });

  it("aplica desconto percentual sobre os produtos e desconto fixo", async () => {
    const { customer, cpII, admin } = await setup();
    const percent = await admin
      .post("/api/orders")
      .send({ ...baseOrder(customer.id, cpII.id), discount: { type: "PERCENTAGE", value: "5" } });
    expect(percent.body.order).toMatchObject({ discountAmount: "77.80", total: "1598.20", discount: { type: "PERCENTAGE", value: "5.00" } });

    const fixed = await admin
      .post("/api/orders")
      .send({ ...baseOrder(customer.id, cpII.id), discount: { type: "FIXED", value: "76.00" } });
    expect(fixed.body.order).toMatchObject({ discountAmount: "76.00", total: "1600.00" });
  });

  it("mudar o preço do produto depois NÃO altera o pedido", async () => {
    const { customer, cpII, admin } = await setup();
    const { body } = await admin.post("/api/orders").send(baseOrder(customer.id, cpII.id));
    await admin.patch(`/api/products/${cpII.id}`).send({ currentPrice: "50.00", name: "Nome novo" });

    const order = (await admin.get(`/api/orders/${body.order.id}`)).body.order;
    expect(order.items[0]).toMatchObject({ productName: "Cimento CP II 50kg", unitPrice: "38.90" });
    expect(order.total).toBe("1676.00");
  });

  it("recusa cliente ou produto inativo", async () => {
    const { customer, cpII, admin } = await setup();
    await prisma.product.update({ where: { id: cpII.id }, data: { active: false } });
    const inactiveProduct = await admin.post("/api/orders").send(baseOrder(customer.id, cpII.id));
    expect(inactiveProduct.status).toBe(400);
    expect(inactiveProduct.body.error.details[0].field).toBe("items.0.productId");

    await prisma.product.update({ where: { id: cpII.id }, data: { active: true } });
    await prisma.customer.update({ where: { id: customer.id }, data: { active: false } });
    expect((await admin.post("/api/orders").send(baseOrder(customer.id, cpII.id))).status).toBe(400);
  });

  it("recusa pedido sem itens, quantidade fracionada ou zero e preço inválido", async () => {
    const { customer, cpII, admin } = await setup();
    const cases = [
      { items: [] },
      { items: [{ productId: cpII.id, quantity: 1.5 }] },
      { items: [{ productId: cpII.id, quantity: 0 }] },
      { items: [{ productId: cpII.id, quantity: 1, unitPrice: "38,90" }] },
      { items: [{ productId: cpII.id, quantity: 1, unitPrice: 38.9 }] },
    ];
    for (const extra of cases) {
      const response = await admin.post("/api/orders").send({ ...baseOrder(customer.id, cpII.id), ...extra });
      expect(response.status, JSON.stringify(extra)).toBe(400);
    }
    expect(await prisma.order.count()).toBe(0);
  });

  it("recusa desconto que deixaria o total negativo, sem gravar nada", async () => {
    const { customer, cpII, admin } = await setup();
    const response = await admin
      .post("/api/orders")
      .send({ ...baseOrder(customer.id, cpII.id), discount: { type: "FIXED", value: "9999.00" } });
    expect(response.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
  });

  it("registra a criação na auditoria", async () => {
    const { customer, cpII, admin } = await setup();
    const { body } = await admin.post("/api/orders").send(baseOrder(customer.id, cpII.id));
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "order.create" } });
    expect(log.entityId).toBe(body.order.id);
    expect(log.after).toMatchObject({ total: "1676.00" });
  });

  it("exige login", async () => {
    const { customer, cpII } = await setup();
    expect((await request(app).post("/api/orders").send(baseOrder(customer.id, cpII.id))).status).toBe(401);
  });
});

describe("pré-visualização", () => {
  it("calcula sem gravar nada", async () => {
    const { cpII, cpV, financeiro } = await setup();
    const response = await financeiro.post("/api/orders/preview").send({
      items: [
        { productId: cpII.id, quantity: 3 },
        { productId: cpV.id, quantity: 10, unitPrice: "44.00" },
      ],
      freightAmount: "15.50",
      discount: { type: "FIXED", value: "10.00" },
    });

    expect(response.status).toBe(200);
    expect(response.body.preview).toMatchObject({ subtotal: "556.70", discountAmount: "10.00", total: "562.20" });
    expect(response.body.preview.items[0]).toMatchObject({ unitPrice: "38.90", lineTotal: "116.70" });
    expect(await prisma.order.count()).toBe(0);
  });
});

describe("editar pedido pendente", () => {
  it("substitui itens, recalcula, aumenta a versão e guarda antes/depois na auditoria", async () => {
    const { customer, cpII, cpV, financeiro } = await setup();
    const { body } = await financeiro.post("/api/orders").send(baseOrder(customer.id, cpII.id));

    const response = await financeiro.put(`/api/orders/${body.order.id}`).send({
      ...baseOrder(customer.id, cpII.id),
      items: [{ productId: cpV.id, quantity: 20, unitPrice: "44.00" }],
      freightAmount: "0",
      deliveryMode: "PICKUP",
      version: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body.order).toMatchObject({ total: "880.00", deliveryMode: "PICKUP", version: 2 });
    expect(response.body.order.items).toHaveLength(1);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "order.update" } });
    expect(log.before).toMatchObject({ total: "1676.00" });
    expect(log.after).toMatchObject({ total: "880.00" });
  });

  it("recusa gravação com versão antiga (duas pessoas editando ao mesmo tempo)", async () => {
    const { customer, cpII, admin, financeiro } = await setup();
    const { body } = await admin.post("/api/orders").send(baseOrder(customer.id, cpII.id));
    const edit = { ...baseOrder(customer.id, cpII.id), version: 1 };

    expect((await admin.put(`/api/orders/${body.order.id}`).send({ ...edit, notes: "primeira" })).status).toBe(200);
    const second = await financeiro.put(`/api/orders/${body.order.id}`).send({ ...edit, notes: "segunda" });

    expect(second.status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: body.order.id } })).notes).toBe("primeira");
  });

  it("não edita pedido que não está pendente", async () => {
    const { customer, cpII, admin } = await setup();
    const { body } = await admin.post("/api/orders").send(baseOrder(customer.id, cpII.id));
    await prisma.order.update({ where: { id: body.order.id }, data: { status: "CONFIRMED" } });

    const response = await admin.put(`/api/orders/${body.order.id}`).send({ ...baseOrder(customer.id, cpII.id), version: 1 });
    expect(response.status).toBe(409);
  });

  it("mantém um produto que ficou inativo se ele já estava no pedido", async () => {
    const { customer, cpII, admin } = await setup();
    const { body } = await admin.post("/api/orders").send(baseOrder(customer.id, cpII.id));
    await prisma.product.update({ where: { id: cpII.id }, data: { active: false } });

    const response = await admin
      .put(`/api/orders/${body.order.id}`)
      .send({ ...baseOrder(customer.id, cpII.id), notes: "ajuste", version: 1 });
    expect(response.status).toBe(200);
  });
});

describe("listar e buscar", () => {
  it("busca por número (123 ou PED-000123) e por nome do cliente; mais recente primeiro", async () => {
    const { customer, cpII, admin } = await setup();
    const other = await prisma.customer.create({ data: { name: "Maria Pedreira" } });
    await admin.post("/api/orders").send(baseOrder(customer.id, cpII.id));
    await admin.post("/api/orders").send(baseOrder(other.id, cpII.id));

    const all = await admin.get("/api/orders");
    expect(all.body.orders.map((o: { code: string }) => o.code)).toEqual(["PED-000002", "PED-000001"]);
    expect((await admin.get("/api/orders").query({ search: "PED-000001" })).body.total).toBe(1);
    expect((await admin.get("/api/orders").query({ search: "2" })).body.orders[0].customerName).toBe("Maria Pedreira");
    expect((await admin.get("/api/orders").query({ search: "pedreira" })).body.total).toBe(1);
    expect((await admin.get("/api/orders").query({ status: "CONFIRMED" })).body.total).toBe(0);
  });

  it("responde 404 para pedido inexistente", async () => {
    const { admin } = await setup();
    expect((await admin.get("/api/orders/nao-existe")).status).toBe(404);
  });
});

describe("integridade no banco", () => {
  it("o banco recusa quantidade zero mesmo se o código falhar", async () => {
    const { customer, cpII, admin } = await setup();
    const { body } = await admin.post("/api/orders").send(baseOrder(customer.id, cpII.id));
    await expect(
      prisma.orderItem.updateMany({ where: { orderId: body.order.id }, data: { quantity: 0 } }),
    ).rejects.toThrow();
  });
});
