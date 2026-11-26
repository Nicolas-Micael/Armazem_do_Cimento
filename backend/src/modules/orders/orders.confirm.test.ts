// Testes da confirmação de saída: só ADM, histórico, auditoria, versão e efeito no painel.
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
  const product = await prisma.product.create({ data: { name: "Cimento CP II 50kg", currentPrice: "38.90" } });
  const admin = await loginAs(app, "chefe");
  const financeiro = await loginAs(app, "caixa1");
  // O pedido é criado pelo Financeiro (atendimento), como na operação real.
  const created = await financeiro.post("/api/orders").send({
    customerId: customer.id,
    items: [{ productId: product.id, quantity: 40 }],
    freightAmount: "120.00",
    paymentTerm: "TERM_15_DAYS",
    deliveryMode: "DELIVERY",
  });
  expect(created.status).toBe(201);
  return { customer, product, admin, financeiro, order: created.body.order as { id: string; version: number; total: string } };
}

describe("POST /api/orders/:id/confirm", () => {
  it("ADM confirma: muda o status, registra quem/quando no histórico e na auditoria, sem alterar valores", async () => {
    const { admin, order } = await setup();
    const response = await admin.post(`/api/orders/${order.id}/confirm`).send({ version: order.version, note: "Cliente confirmou por telefone" });

    expect(response.status).toBe(200);
    expect(response.body.order.status).toBe("CONFIRMED");
    expect(response.body.order.version).toBe(order.version + 1);
    expect(response.body.order.total).toBe(order.total); // valores intactos

    const history = response.body.order.statusHistory;
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({ fromStatus: "PENDING", toStatus: "CONFIRMED", changedBy: "Teste chefe", note: "Cliente confirmou por telefone" });
    expect(new Date(history[1].changedAt).getTime()).toBeGreaterThan(Date.now() - 10_000);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "order.confirm", entityId: order.id } });
    expect((audit.before as { status: string }).status).toBe("PENDING");
    expect((audit.after as { status: string }).status).toBe("CONFIRMED");
    expect((audit.after as { total: string }).total).toBe(order.total);
  });

  it("Financeiro não pode confirmar (403) e o pedido continua pendente", async () => {
    const { financeiro, order } = await setup();
    const response = await financeiro.post(`/api/orders/${order.id}/confirm`).send({ version: order.version });
    expect(response.status).toBe(403);

    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe("PENDING");
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "order.confirm" } })).toBe(0);
  });

  it("exige login", async () => {
    const { order } = await setup();
    const response = await request(app).post(`/api/orders/${order.id}/confirm`).send({ version: order.version });
    expect(response.status).toBe(401);
  });

  it("não confirma duas vezes: a segunda tentativa é recusada e o histórico não duplica", async () => {
    const { admin, order } = await setup();
    expect((await admin.post(`/api/orders/${order.id}/confirm`).send({ version: order.version })).status).toBe(200);
    const second = await admin.post(`/api/orders/${order.id}/confirm`).send({ version: order.version + 1 });
    expect(second.status).toBe(409);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: "CONFIRMED" } })).toBe(1);
  });

  it("duas confirmações simultâneas: só uma vale", async () => {
    const { admin, order } = await setup();
    const results = await Promise.all([
      admin.post(`/api/orders/${order.id}/confirm`).send({ version: order.version }),
      admin.post(`/api/orders/${order.id}/confirm`).send({ version: order.version }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: "CONFIRMED" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "order.confirm" } })).toBe(1);
  });

  it("recusa versão antiga: pedido editado depois que o ADM abriu a tela não é confirmado", async () => {
    const { admin, financeiro, order, customer, product } = await setup();
    const edit = await financeiro.put(`/api/orders/${order.id}`).send({
      version: order.version,
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 60 }],
      freightAmount: "120.00",
      paymentTerm: "TERM_15_DAYS",
      deliveryMode: "DELIVERY",
    });
    expect(edit.status).toBe(200);

    const stale = await admin.post(`/api/orders/${order.id}/confirm`).send({ version: order.version });
    expect(stale.status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");

    // Com a versão atual (a que o ADM viu depois de recarregar), confirma.
    const ok = await admin.post(`/api/orders/${order.id}/confirm`).send({ version: edit.body.order.version });
    expect(ok.status).toBe(200);
  });

  it("não confirma pedido cancelado nem inexistente", async () => {
    const { admin, order } = await setup();
    await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    expect((await admin.post(`/api/orders/${order.id}/confirm`).send({ version: order.version })).status).toBe(409);
    expect((await admin.post("/api/orders/00000000-0000-0000-0000-000000000000/confirm").send({ version: 1 })).status).toBe(404);
  });

  it("exige a versão e limita a observação", async () => {
    const { admin, order } = await setup();
    expect((await admin.post(`/api/orders/${order.id}/confirm`).send({})).status).toBe(400);
    expect((await admin.post(`/api/orders/${order.id}/confirm`).send({ version: order.version, note: "x".repeat(501) })).status).toBe(400);
  });

  it("depois de confirmado, o pedido não pode mais ser editado (nenhum valor muda sem registro)", async () => {
    const { admin, financeiro, order, customer, product } = await setup();
    const confirmed = await admin.post(`/api/orders/${order.id}/confirm`).send({ version: order.version });
    const edit = await financeiro.put(`/api/orders/${order.id}`).send({
      version: confirmed.body.order.version,
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1, unitPrice: "1.00" }],
      freightAmount: "0",
      paymentTerm: "IMMEDIATE",
      deliveryMode: "PICKUP",
    });
    expect(edit.status).toBe(409);
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.total.toFixed(2)).toBe(order.total);
  });

  it("a saída confirmada passa a contar no painel; antes, não contava", async () => {
    const { admin, order } = await setup();
    // Janela de 3 dias em volta de hoje (o painel aceita no máximo 366 dias por consulta).
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const period = `?from=${day(-1)}&to=${day(1)}`;
    const before = await admin.get(`/api/dashboard${period}`);
    expect(before.body.totals).toMatchObject({ ordersCount: 0, bagsSold: 0, revenue: "0.00" });
    expect(before.body.pendingOrders.ordersCount).toBe(1);

    await admin.post(`/api/orders/${order.id}/confirm`).send({ version: order.version });
    const after = await admin.get(`/api/dashboard${period}`);
    expect(after.body.totals).toMatchObject({ ordersCount: 1, bagsSold: 40, revenue: order.total });
    expect(after.body.pendingOrders.ordersCount).toBe(0);
  });

  it("edição e confirmação ao mesmo tempo: o pedido confirmado nunca muda de valor", async () => {
    const { admin, financeiro, order, customer, product } = await setup();
    const [edit, confirm] = await Promise.all([
      financeiro.put(`/api/orders/${order.id}`).send({
        version: order.version,
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 99 }],
        freightAmount: "0",
        paymentTerm: "IMMEDIATE",
        deliveryMode: "PICKUP",
      }),
      admin.post(`/api/orders/${order.id}/confirm`).send({ version: order.version }),
    ]);
    // Exatamente uma das duas vale (as duas usam a mesma versão).
    expect([edit.status, confirm.status].sort()).toEqual([200, 409]);

    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    if (confirm.status === 200) {
      expect(stored.status).toBe("CONFIRMED");
      expect(stored.total.toFixed(2)).toBe(order.total); // a edição perdedora não alterou nada
      expect(stored.items[0]?.quantity).toBe(40);
    } else {
      expect(stored.status).toBe("PENDING");
    }
  });
});
