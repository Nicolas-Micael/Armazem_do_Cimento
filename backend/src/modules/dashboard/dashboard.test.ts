// Testes do painel: só saídas efetivadas contam, valores exatos, fuso de Brasília e permissões.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import type { OrderStatus } from "../../generated/prisma/client.js";
import { createTestUser, loginAs, resetDatabase } from "../../../tests/helpers.js";
import { variationPercent } from "./dashboard.service.js";

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function setup() {
  const user = await createTestUser({ username: "chefe", role: "ADMIN" });
  await createTestUser({ username: "caixa1", role: "FINANCEIRO" });
  const alpha = await prisma.customer.create({ data: { name: "Alfa Construções" } });
  const beta = await prisma.customer.create({ data: { name: "Beta Materiais" } });
  const cpII = await prisma.product.create({ data: { name: "CP II 50kg", currentPrice: "38.90" } });
  const cpV = await prisma.product.create({ data: { name: "CP V 40kg", currentPrice: "45.15" } });
  return { user, alpha, beta, cpII, cpV, admin: await loginAs(app, "chefe"), financeiro: await loginAs(app, "caixa1") };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

/** Cria um pedido direto no banco, com data e situação escolhidas. */
async function insertOrder(
  ctx: Ctx,
  options: {
    customerId: string;
    status: OrderStatus;
    createdAt: string;
    items: { productId: string; quantity: number; unitPrice: string }[];
    freight?: string;
    discount?: string;
  },
) {
  const lineTotals = options.items.map((item) => (BigInt(Math.round(Number(item.unitPrice) * 100)) * BigInt(item.quantity)));
  const subtotalCents = lineTotals.reduce((sum, value) => sum + value, 0n);
  const freightCents = BigInt(Math.round(Number(options.freight ?? "0") * 100));
  const discountCents = BigInt(Math.round(Number(options.discount ?? "0") * 100));
  const cents = (value: bigint) => `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: options.customerId } });
  return prisma.order.create({
    data: {
      customerId: options.customerId,
      customerNameSnapshot: customer.name,
      status: options.status,
      subtotal: cents(subtotalCents),
      freightAmount: cents(freightCents),
      discountAmount: cents(discountCents),
      total: cents(subtotalCents + freightCents - discountCents),
      paymentTerm: "IMMEDIATE",
      deliveryMode: "PICKUP",
      createdById: ctx.user.id,
      createdAt: new Date(options.createdAt),
      items: {
        create: options.items.map((item, index) => ({
          productId: item.productId,
          position: index + 1,
          productNameSnapshot: "x",
          unit: "SACO",
          quantity: item.quantity,
          catalogUnitPrice: item.unitPrice,
          unitPrice: item.unitPrice,
          lineTotal: cents(lineTotals[index]!),
        })),
      },
    },
  });
}

const NOV = "?from=2026-11-01&to=2026-11-30";

describe("GET /api/dashboard", () => {
  it("exige login", async () => {
    const response = await request(app).get("/api/dashboard");
    expect(response.status).toBe(401);
  });

  it("ADM e Financeiro podem ver o painel", async () => {
    const ctx = await setup();
    expect((await ctx.admin.get(`/api/dashboard${NOV}`)).status).toBe(200);
    expect((await ctx.financeiro.get(`/api/dashboard${NOV}`)).status).toBe(200);
  });

  it("sem nenhuma saída: tudo zerado, sem inventar valores", async () => {
    const ctx = await setup();
    const { body } = await ctx.admin.get(`/api/dashboard${NOV}`);
    expect(body.totals).toEqual({ ordersCount: 0, bagsSold: 0, revenue: "0.00", averageTicket: "0.00", customersServed: 0 });
    expect(body.variation.revenue).toBeNull();
    expect(body.salesByDay).toHaveLength(30);
    expect(body.salesByDay.every((day: { ordersCount: number }) => day.ordersCount === 0)).toBe(true);
    expect(body.salesByProduct).toEqual([]);
    expect(body.topCustomers).toEqual([]);
    expect(body.recentOrders).toEqual([]);
    expect(body.pendingOrders).toEqual({ ordersCount: 0, total: "0.00" });
  });

  it("conta só saídas efetivadas: pendentes e canceladas ficam de fora", async () => {
    const ctx = await setup();
    const item = (quantity: number) => [{ productId: ctx.cpII.id, quantity, unitPrice: "38.90" }];
    for (const status of ["CONFIRMED", "PICKING", "OUT_FOR_DELIVERY", "COMPLETED"] as const) {
      await insertOrder(ctx, { customerId: ctx.alpha.id, status, createdAt: "2026-11-10T15:00:00Z", items: item(10) });
    }
    await insertOrder(ctx, { customerId: ctx.beta.id, status: "PENDING", createdAt: "2026-11-10T15:00:00Z", items: item(100) });
    await insertOrder(ctx, { customerId: ctx.beta.id, status: "CANCELLED", createdAt: "2026-11-10T15:00:00Z", items: item(200) });

    const { body } = await ctx.admin.get(`/api/dashboard${NOV}`);
    expect(body.totals.ordersCount).toBe(4);
    expect(body.totals.bagsSold).toBe(40);
    expect(body.totals.revenue).toBe("1556.00"); // 4 × (10 × 38,90)
    expect(body.totals.customersServed).toBe(1); // Beta só tem pendente/cancelada
    expect(body.topCustomers.map((c: { customerName: string }) => c.customerName)).toEqual(["Alfa Construções"]);
    // Pendente aparece à parte, como trabalho em aberto, sem entrar nos indicadores.
    expect(body.pendingOrders).toEqual({ ordersCount: 1, total: "3890.00" });
  });

  it("faturamento usa o total do pedido (produtos + frete − desconto) e o ticket médio é exato", async () => {
    const ctx = await setup();
    await insertOrder(ctx, {
      customerId: ctx.alpha.id, status: "CONFIRMED", createdAt: "2026-11-05T15:00:00Z",
      items: [{ productId: ctx.cpII.id, quantity: 3, unitPrice: "38.90" }], freight: "20.00", discount: "5.55",
    }); // 116,70 + 20,00 − 5,55 = 131,15
    await insertOrder(ctx, {
      customerId: ctx.beta.id, status: "COMPLETED", createdAt: "2026-11-06T15:00:00Z",
      items: [{ productId: ctx.cpV.id, quantity: 1, unitPrice: "45.15" }],
    }); // 45,15
    await insertOrder(ctx, {
      customerId: ctx.beta.id, status: "COMPLETED", createdAt: "2026-11-07T15:00:00Z",
      items: [{ productId: ctx.cpV.id, quantity: 1, unitPrice: "0.01" }],
    }); // 0,01

    const { body } = await ctx.admin.get(`/api/dashboard${NOV}`);
    expect(body.totals.revenue).toBe("176.31");
    expect(body.totals.ordersCount).toBe(3);
    expect(body.totals.bagsSold).toBe(5);
    expect(body.totals.averageTicket).toBe("58.77"); // 176,31 ÷ 3 = 58,77
    expect(body.totals.customersServed).toBe(2);
  });

  it("respeita o período e o fuso de Brasília (UTC−3)", async () => {
    const ctx = await setup();
    const items = [{ productId: ctx.cpII.id, quantity: 1, unitPrice: "10.00" }];
    // 01/12 02:30 UTC = 30/11 23:30 em Brasília → ENTRA em novembro.
    await insertOrder(ctx, { customerId: ctx.alpha.id, status: "CONFIRMED", createdAt: "2026-12-01T02:30:00Z", items });
    // 01/12 03:00 UTC = 01/12 00:00 em Brasília → NÃO entra.
    await insertOrder(ctx, { customerId: ctx.alpha.id, status: "CONFIRMED", createdAt: "2026-12-01T03:00:00Z", items });
    // 01/11 02:59 UTC = 31/10 23:59 em Brasília → NÃO entra.
    await insertOrder(ctx, { customerId: ctx.alpha.id, status: "CONFIRMED", createdAt: "2026-11-01T02:59:00Z", items });
    // 01/11 03:00 UTC = 01/11 00:00 em Brasília → ENTRA.
    await insertOrder(ctx, { customerId: ctx.alpha.id, status: "CONFIRMED", createdAt: "2026-11-01T03:00:00Z", items });

    const { body } = await ctx.admin.get(`/api/dashboard${NOV}`);
    expect(body.totals.ordersCount).toBe(2);
    const byDate = Object.fromEntries(body.salesByDay.map((d: { date: string; ordersCount: number }) => [d.date, d.ordersCount]));
    expect(byDate["2026-11-01"]).toBe(1);
    expect(byDate["2026-11-30"]).toBe(1);
  });

  it("evolução por dia: soma por dia e dias sem venda aparecem zerados", async () => {
    const ctx = await setup();
    const make = (quantity: number) => [{ productId: ctx.cpII.id, quantity, unitPrice: "40.00" }];
    await insertOrder(ctx, { customerId: ctx.alpha.id, status: "CONFIRMED", createdAt: "2026-11-02T14:00:00Z", items: make(5) });
    await insertOrder(ctx, { customerId: ctx.beta.id, status: "COMPLETED", createdAt: "2026-11-02T18:00:00Z", items: make(7) });
    await insertOrder(ctx, { customerId: ctx.alpha.id, status: "CONFIRMED", createdAt: "2026-11-04T14:00:00Z", items: make(2) });

    const { body } = await ctx.admin.get("/api/dashboard?from=2026-11-01&to=2026-11-05");
    expect(body.salesByDay).toEqual([
      { date: "2026-11-01", ordersCount: 0, bagsSold: 0, revenue: "0.00" },
      { date: "2026-11-02", ordersCount: 2, bagsSold: 12, revenue: "480.00" },
      { date: "2026-11-03", ordersCount: 0, bagsSold: 0, revenue: "0.00" },
      { date: "2026-11-04", ordersCount: 1, bagsSold: 2, revenue: "80.00" },
      { date: "2026-11-05", ordersCount: 0, bagsSold: 0, revenue: "0.00" },
    ]);
  });

  it("compara com o período anterior de mesma duração", async () => {
    const ctx = await setup();
    const make = (quantity: number) => [{ productId: ctx.cpII.id, quantity, unitPrice: "10.00" }];
    // Anterior (22 a 28/11): 1 saída de 100,00 · Atual (29/11 a 05/12): 1 saída de 150,00
    await insertOrder(ctx, { customerId: ctx.alpha.id, status: "CONFIRMED", createdAt: "2026-11-25T15:00:00Z", items: make(10) });
    await insertOrder(ctx, { customerId: ctx.alpha.id, status: "CONFIRMED", createdAt: "2026-12-01T15:00:00Z", items: make(15) });

    const { body } = await ctx.admin.get("/api/dashboard?from=2026-11-29&to=2026-12-05");
    expect(body.previousPeriod).toEqual({ from: "2026-11-22", to: "2026-11-28" });
    expect(body.previousTotals.revenue).toBe("100.00");
    expect(body.totals.revenue).toBe("150.00");
    expect(body.variation.revenue).toBe("50.0");
    expect(body.variation.bagsSold).toBe("50.0");
  });

  it("ranking de produtos e de clientes por sacos vendidos", async () => {
    const ctx = await setup();
    await insertOrder(ctx, {
      customerId: ctx.alpha.id, status: "CONFIRMED", createdAt: "2026-11-03T15:00:00Z",
      items: [{ productId: ctx.cpII.id, quantity: 30, unitPrice: "38.90" }, { productId: ctx.cpV.id, quantity: 10, unitPrice: "45.15" }],
    });
    await insertOrder(ctx, {
      customerId: ctx.beta.id, status: "COMPLETED", createdAt: "2026-11-04T15:00:00Z",
      items: [{ productId: ctx.cpV.id, quantity: 50, unitPrice: "45.00" }],
    });

    const { body } = await ctx.admin.get(`/api/dashboard${NOV}`);
    expect(body.salesByProduct).toEqual([
      { productId: ctx.cpV.id, productName: "CP V 40kg", bagsSold: 60, itemsValue: "2701.50" },
      { productId: ctx.cpII.id, productName: "CP II 50kg", bagsSold: 30, itemsValue: "1167.00" },
    ]);
    expect(body.topCustomers).toEqual([
      { customerId: ctx.beta.id, customerName: "Beta Materiais", ordersCount: 1, bagsSold: 50, revenue: "2250.00" },
      { customerId: ctx.alpha.id, customerName: "Alfa Construções", ordersCount: 1, bagsSold: 40, revenue: "1618.50" },
    ]);
  });

  it("últimas saídas: só efetivadas do período, da mais nova para a mais antiga", async () => {
    const ctx = await setup();
    const items = [{ productId: ctx.cpII.id, quantity: 2, unitPrice: "10.00" }];
    await insertOrder(ctx, { customerId: ctx.alpha.id, status: "CONFIRMED", createdAt: "2026-11-03T15:00:00Z", items });
    await insertOrder(ctx, { customerId: ctx.beta.id, status: "COMPLETED", createdAt: "2026-11-08T15:00:00Z", items });
    await insertOrder(ctx, { customerId: ctx.beta.id, status: "PENDING", createdAt: "2026-11-09T15:00:00Z", items });

    const { body } = await ctx.admin.get(`/api/dashboard${NOV}`);
    expect(body.recentOrders.map((o: { customerName: string }) => o.customerName)).toEqual(["Beta Materiais", "Alfa Construções"]);
    expect(body.recentOrders[0]).toMatchObject({ bagsSold: 2, total: "20.00", status: "COMPLETED" });
  });

  it("recusa período inválido", async () => {
    const ctx = await setup();
    expect((await ctx.admin.get("/api/dashboard?from=2026-11-10&to=2026-11-01")).status).toBe(400);
    expect((await ctx.admin.get("/api/dashboard?from=abc&to=2026-11-01")).status).toBe(400);
    expect((await ctx.admin.get("/api/dashboard?from=2026-02-30&to=2026-03-01")).status).toBe(400);
    expect((await ctx.admin.get("/api/dashboard?from=2024-01-01&to=2026-11-01")).status).toBe(400);
  });
});

describe("variationPercent", () => {
  it("calcula em Decimal e devolve null sem base de comparação", () => {
    expect(variationPercent("150.00", "100.00")).toBe("50.0");
    expect(variationPercent("90.00", "100.00")).toBe("-10.0");
    expect(variationPercent(1, 3)).toBe("-66.7");
    expect(variationPercent("10.00", "0.00")).toBeNull();
    expect(variationPercent(0, 0)).toBeNull();
  });
});
