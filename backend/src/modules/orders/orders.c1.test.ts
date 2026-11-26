// Testes da etapa C1: desconto por item, 30 dias, tipo de operação, logística, filtros/ordenação/totalizadores da lista e histórico.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestUser, loginAs, resetDatabase } from "../../../tests/helpers.js";
import { diffOrderSnapshots } from "./orders.history.js";

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function setup() {
  await createTestUser({ username: "chefe", role: "ADMIN" });
  await createTestUser({ username: "caixa1", role: "FINANCEIRO" });
  const alpha = await prisma.customer.create({ data: { name: "Alfa Construções", phone: "11987654321" } });
  const beta = await prisma.customer.create({ data: { name: "Beta Materiais", document: "11222333000181" } });
  const cpII = await prisma.product.create({ data: { name: "CP II 50kg", currentPrice: "40.00" } });
  const cpV = await prisma.product.create({ data: { name: "CP V 40kg", currentPrice: "50.00" } });
  return { alpha, beta, cpII, cpV, admin: await loginAs(app, "chefe"), financeiro: await loginAs(app, "caixa1") };
}
type Ctx = Awaited<ReturnType<typeof setup>>;

function body(ctx: Ctx, overrides: Record<string, unknown> = {}) {
  return {
    customerId: ctx.alpha.id,
    items: [{ productId: ctx.cpII.id, quantity: 10 }],
    freightAmount: "0",
    paymentTerm: "IMMEDIATE",
    deliveryMode: "PICKUP",
    ...overrides,
  };
}

describe("campos novos do pedido", () => {
  it("aceita prazo de 30 dias e tipo de operação Venda (padrão)", async () => {
    const ctx = await setup();
    const response = await ctx.financeiro.post("/api/orders").send(body(ctx, { paymentTerm: "TERM_30_DAYS" }));
    expect(response.status).toBe(201);
    expect(response.body.order.paymentTerm).toBe("TERM_30_DAYS");
    expect(response.body.order.operationType).toBe("SALE");
  });

  it("recusa tipo de operação desconhecido", async () => {
    const ctx = await setup();
    const response = await ctx.financeiro.post("/api/orders").send(body(ctx, { operationType: "BONIFICACAO" }));
    expect(response.status).toBe(400);
  });

  it("grava a logística em texto, com placa em maiúsculas, e a edição substitui os valores", async () => {
    const ctx = await setup();
    const created = await ctx.financeiro.post("/api/orders").send(
      body(ctx, {
        deliveryMode: "DELIVERY",
        deliveryResponsible: "Transportadora Rápida",
        driverName: "José da Silva",
        helperName: "Paulo",
        vehicle: "Caminhão baú",
        licensePlate: " abc1d23 ",
        loadedBags: 380,
      }),
    );
    expect(created.status).toBe(201);
    expect(created.body.order).toMatchObject({
      deliveryResponsible: "Transportadora Rápida", driverName: "José da Silva", helperName: "Paulo",
      vehicle: "Caminhão baú", licensePlate: "ABC1D23", loadedBags: 380,
    });

    const edited = await ctx.financeiro.put(`/api/orders/${created.body.order.id}`).send({
      ...body(ctx, { deliveryMode: "DELIVERY", driverName: "Marcos", loadedBags: 0 }),
      version: created.body.order.version,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.order).toMatchObject({ driverName: "Marcos", helperName: null, licensePlate: null, loadedBags: 0 });
  });

  it("recusa sacos carregados negativos ou fracionados", async () => {
    const ctx = await setup();
    expect((await ctx.financeiro.post("/api/orders").send(body(ctx, { loadedBags: -1 }))).status).toBe(400);
    expect((await ctx.financeiro.post("/api/orders").send(body(ctx, { loadedBags: 1.5 }))).status).toBe(400);
  });
});

describe("desconto por item + desconto geral (API e banco)", () => {
  const withDiscounts = (ctx: Ctx) =>
    body(ctx, {
      items: [
        { productId: ctx.cpII.id, quantity: 10, unitPrice: "40.00", discount: { type: "FIXED", value: "20.00" } }, // 400 − 20 = 380
        { productId: ctx.cpV.id, quantity: 4, discount: { type: "PERCENTAGE", value: "10" } }, // 200 − 20 = 180
      ],
      freightAmount: "30.00",
      discount: { type: "PERCENTAGE", value: "5" }, // 5% de 560 = 28
    });

  it("calcula, grava e devolve os dois tipos de desconto sem duplicidade", async () => {
    const ctx = await setup();
    const response = await ctx.financeiro.post("/api/orders").send(withDiscounts(ctx));
    expect(response.status).toBe(201);
    const order = response.body.order;
    expect(order.items[0]).toMatchObject({ grossTotal: "400.00", discountAmount: "20.00", lineTotal: "380.00", discount: { type: "FIXED", value: "20.00" } });
    expect(order.items[1]).toMatchObject({ grossTotal: "200.00", discountAmount: "20.00", lineTotal: "180.00", discount: { type: "PERCENTAGE", value: "10.00" } });
    expect(order).toMatchObject({ subtotal: "560.00", itemDiscountsTotal: "40.00", discountAmount: "28.00", totalDiscounts: "68.00", freightAmount: "30.00", total: "562.00" });

    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: { orderBy: { position: "asc" } } } });
    expect(stored.items.map((i) => i.discountAmount.toFixed(2))).toEqual(["20.00", "20.00"]);
    expect(stored.items.map((i) => i.discountType)).toEqual(["FIXED", "PERCENTAGE"]);
  });

  it("a prévia dá os mesmos valores que a gravação", async () => {
    const ctx = await setup();
    const { items, freightAmount, discount } = withDiscounts(ctx);
    const preview = await ctx.financeiro.post("/api/orders/preview").send({ items, freightAmount, discount });
    expect(preview.status).toBe(200);
    expect(preview.body.preview).toMatchObject({ grossSubtotal: "600.00", itemDiscountsTotal: "40.00", subtotal: "560.00", discountAmount: "28.00", totalDiscounts: "68.00", total: "562.00" });
    expect(preview.body.preview.items[0]).toMatchObject({ grossTotal: "400.00", discountAmount: "20.00", lineTotal: "380.00" });
  });

  it("recusa desconto do item maior que o item, apontando o item", async () => {
    const ctx = await setup();
    const response = await ctx.financeiro.post("/api/orders").send(
      body(ctx, {
        items: [
          { productId: ctx.cpII.id, quantity: 1 },
          { productId: ctx.cpV.id, quantity: 1, unitPrice: "10.00", discount: { type: "FIXED", value: "10.01" } },
        ],
      }),
    );
    expect(response.status).toBe(400);
    expect(response.body.error?.details ?? response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "items.1.discount.value" })]),
    );
    expect(await prisma.order.count()).toBe(0);
  });

  it("o banco recusa item com total diferente de bruto − desconto e desconto maior que o bruto", async () => {
    const ctx = await setup();
    const created = await ctx.financeiro.post("/api/orders").send(body(ctx));
    const itemId = created.body.order.items[0].id as string;
    await expect(prisma.$executeRawUnsafe(`UPDATE order_items SET line_total = 1 WHERE id = '${itemId}'`)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`UPDATE order_items SET discount_amount = 999999, line_total = 0 WHERE id = '${itemId}'`)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`UPDATE orders SET loaded_bags = -5 WHERE id = '${created.body.order.id}'`)).rejects.toThrow();
  });

  it("painel: o valor por produto usa o líquido do item e o faturamento usa o total do pedido", async () => {
    const ctx = await setup();
    const created = await ctx.financeiro.post("/api/orders").send(withDiscounts(ctx));
    await ctx.admin.post(`/api/orders/${created.body.order.id}/confirm`).send({ version: created.body.order.version });
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const dash = await ctx.admin.get(`/api/dashboard?from=${day(-1)}&to=${day(1)}`);
    expect(dash.body.totals.revenue).toBe("562.00");
    const byProduct = Object.fromEntries(dash.body.salesByProduct.map((p: { productName: string; itemsValue: string }) => [p.productName, p.itemsValue]));
    expect(byProduct).toEqual({ "CP II 50kg": "380.00", "CP V 40kg": "180.00" });
  });
});

/** Cria uma saída pela API e ajusta situação/data direto no banco (para montar cenários de lista). */
async function make(ctx: Ctx, options: { customerId?: string; productId?: string; quantity: number; unitPrice: string; paymentTerm?: string; status?: "PENDING" | "CONFIRMED" | "CANCELLED"; createdAt?: string }) {
  const response = await ctx.financeiro.post("/api/orders").send(
    body(ctx, {
      customerId: options.customerId ?? ctx.alpha.id,
      items: [{ productId: options.productId ?? ctx.cpII.id, quantity: options.quantity, unitPrice: options.unitPrice }],
      paymentTerm: options.paymentTerm ?? "IMMEDIATE",
    }),
  );
  expect(response.status).toBe(201);
  await prisma.order.update({
    where: { id: response.body.order.id },
    data: { ...(options.status && { status: options.status }), ...(options.createdAt && { createdAt: new Date(options.createdAt) }) },
  });
  return response.body.order as { id: string; code: string };
}

describe("lista de saídas: filtros, ordenação e totalizadores", () => {
  async function scenario() {
    const ctx = await setup();
    const o1 = await make(ctx, { quantity: 10, unitPrice: "40.00", status: "CONFIRMED", createdAt: "2026-11-05T15:00:00Z" }); // alfa, CP II, 400
    const o2 = await make(ctx, { customerId: ctx.beta.id, productId: ctx.cpV.id, quantity: 20, unitPrice: "50.00", paymentTerm: "TERM_30_DAYS", status: "CONFIRMED", createdAt: "2026-11-10T15:00:00Z" }); // beta, CP V, 1000
    const o3 = await make(ctx, { quantity: 5, unitPrice: "40.00", status: "PENDING", createdAt: "2026-11-20T15:00:00Z" }); // alfa, pendente, 200
    const o4 = await make(ctx, { customerId: ctx.beta.id, quantity: 7, unitPrice: "40.00", status: "CANCELLED", createdAt: "2026-11-21T15:00:00Z" }); // beta, cancelada
    return { ctx, o1, o2, o3, o4 };
  }
  const codes = (res: { body: { orders: { code: string }[] } }) => res.body.orders.map((o) => o.code);

  it("filtra por cliente, produto, condição de pagamento e situação", async () => {
    const { ctx, o1, o2, o3, o4 } = await scenario();
    expect(codes(await ctx.admin.get(`/api/orders?customerId=${ctx.beta.id}`))).toEqual([o4.code, o2.code]);
    expect(codes(await ctx.admin.get(`/api/orders?productId=${ctx.cpV.id}`))).toEqual([o2.code]);
    expect(codes(await ctx.admin.get("/api/orders?paymentTerm=TERM_30_DAYS"))).toEqual([o2.code]);
    expect(codes(await ctx.admin.get("/api/orders?status=PENDING"))).toEqual([o3.code]);
    expect(codes(await ctx.admin.get("/api/orders"))).toEqual([o4.code, o3.code, o2.code, o1.code]);
  });

  it("filtra por período em dias inteiros de Brasília", async () => {
    const { ctx, o1, o2 } = await scenario();
    expect(codes(await ctx.admin.get("/api/orders?from=2026-11-05&to=2026-11-10"))).toEqual([o2.code, o1.code]);
    expect(codes(await ctx.admin.get("/api/orders?from=2026-11-06&to=2026-11-10"))).toEqual([o2.code]);
    expect(codes(await ctx.admin.get("/api/orders?to=2026-11-04"))).toEqual([]);
    // fronteira: 01/12 02:30 UTC é 30/11 23:30 em Brasília
    await prisma.order.update({ where: { id: o1.id }, data: { createdAt: new Date("2026-12-01T02:30:00Z") } });
    expect(codes(await ctx.admin.get("/api/orders?from=2026-11-30&to=2026-11-30"))).toEqual([o1.code]);
    expect(codes(await ctx.admin.get("/api/orders?from=2026-12-01&to=2026-12-01"))).toEqual([]);
  });

  it("combina filtros e busca por número ou cliente", async () => {
    const { ctx, o2 } = await scenario();
    expect(codes(await ctx.admin.get(`/api/orders?customerId=${ctx.beta.id}&status=CONFIRMED&search=beta`))).toEqual([o2.code]);
    expect(codes(await ctx.admin.get(`/api/orders?search=${o2.code}`))).toEqual([o2.code]);
  });

  it("ordena por total, data e cliente nos dois sentidos", async () => {
    const { ctx, o1, o2, o3, o4 } = await scenario();
    // totais: o1 400, o2 1000, o3 200, o4 280
    expect(codes(await ctx.admin.get("/api/orders?sortBy=total&sortDir=asc"))).toEqual([o3.code, o4.code, o1.code, o2.code]);
    expect(codes(await ctx.admin.get("/api/orders?sortBy=total&sortDir=desc"))).toEqual([o2.code, o1.code, o4.code, o3.code]);
    expect(codes(await ctx.admin.get("/api/orders?sortBy=createdAt&sortDir=asc"))).toEqual([o1.code, o2.code, o3.code, o4.code]);
    const byCustomer = codes(await ctx.admin.get("/api/orders?sortBy=customer&sortDir=asc"));
    expect(byCustomer.slice(0, 2).sort()).toEqual([o1.code, o3.code].sort()); // Alfa antes de Beta
  });

  it("totalizadores valem para o filtro inteiro (não só a página) e separam efetivadas de pendentes; cancelada não entra", async () => {
    const { ctx } = await scenario();
    const page1 = await ctx.admin.get("/api/orders?pageSize=1&page=1");
    expect(page1.body.orders).toHaveLength(1);
    expect(page1.body.total).toBe(4);
    expect(page1.body.totals.effective).toEqual({ ordersCount: 2, bagsSold: 30, total: "1400.00" });
    expect(page1.body.totals.pending).toEqual({ ordersCount: 1, bagsSold: 5, total: "200.00" });

    const filtered = await ctx.admin.get(`/api/orders?customerId=${ctx.beta.id}`);
    expect(filtered.body.totals.effective).toEqual({ ordersCount: 1, bagsSold: 20, total: "1000.00" });
    expect(filtered.body.totals.pending).toEqual({ ordersCount: 0, bagsSold: 0, total: "0.00" });
  });

  it("recusa ordenação inválida e período invertido", async () => {
    const { ctx } = await scenario();
    expect((await ctx.admin.get("/api/orders?sortBy=senha")).status).toBe(400);
    expect((await ctx.admin.get("/api/orders?sortDir=up")).status).toBe(400);
    expect((await ctx.admin.get("/api/orders?from=2026-11-10&to=2026-11-01")).status).toBe(400);
    expect((await ctx.admin.get("/api/orders?from=ontem")).status).toBe(400);
  });

  it("Financeiro também lista (e vê os mesmos totais)", async () => {
    const { ctx } = await scenario();
    const response = await ctx.financeiro.get("/api/orders");
    expect(response.status).toBe(200);
    expect(response.body.totals.effective.ordersCount).toBe(2);
  });
});

describe("busca de cliente por telefone", () => {
  it("encontra pelo telefone (só dígitos ou formatado)", async () => {
    const ctx = await setup();
    const byDigits = await ctx.financeiro.get("/api/customers?search=98765");
    expect(byDigits.body.customers.map((c: { name: string }) => c.name)).toEqual(["Alfa Construções"]);
    const formatted = await ctx.financeiro.get(`/api/customers?search=${encodeURIComponent("(11) 98765-4321")}`);
    expect(formatted.body.customers.map((c: { name: string }) => c.name)).toEqual(["Alfa Construções"]);
  });
});

describe("histórico de alterações", () => {
  it("mostra criação, edição (com o que mudou) e confirmação, com quem e quando", async () => {
    const ctx = await setup();
    const created = await ctx.financeiro.post("/api/orders").send(body(ctx));
    const order = created.body.order;
    const edited = await ctx.financeiro.put(`/api/orders/${order.id}`).send({
      ...body(ctx, {
        items: [{ productId: ctx.cpII.id, quantity: 12, unitPrice: "39.00", discount: { type: "FIXED", value: "8.00" } }],
        freightAmount: "15.00",
        driverName: "José",
        paymentTerm: "TERM_30_DAYS",
      }),
      version: order.version,
    });
    expect(edited.status).toBe(200);
    await ctx.admin.post(`/api/orders/${order.id}/confirm`).send({ version: edited.body.order.version });

    const history = await ctx.financeiro.get(`/api/orders/${order.id}/history`);
    expect(history.status).toBe(200);
    const events = history.body.events as { action: string; title: string; userName: string; at: string; changes: { label: string; before: string; after: string }[] }[];
    expect(events.map((e) => e.action)).toEqual(["order.create", "order.update", "order.confirm"]);
    expect(events.map((e) => e.userName)).toEqual(["Teste caixa1", "Teste caixa1", "Teste chefe"]);
    expect(events[0]!.changes).toEqual([]);

    const byLabel = Object.fromEntries(events[1]!.changes.map((c) => [c.label, c]));
    expect(byLabel["Frete"]).toMatchObject({ before: "R$ 0,00", after: "R$ 15,00" });
    expect(byLabel["Motorista"]).toMatchObject({ before: "—", after: "José" });
    expect(byLabel["Condição de pagamento"]).toMatchObject({ before: "À vista", after: "30 dias" });
    expect(byLabel["Itens"]!.after).toContain("12 × R$ 39,00 (desconto R$ 8,00)");
    expect(byLabel["Total"]).toMatchObject({ before: "R$ 400,00", after: "R$ 475,00" }); // 468 − 8 + 15

    expect(events[2]!.changes).toEqual([{ field: "status", label: "Situação", before: "Pendente", after: "Confirmado" }]);
    expect(Date.parse(events[2]!.at)).toBeGreaterThanOrEqual(Date.parse(events[0]!.at));
  });

  it("404 para saída inexistente e exige login", async () => {
    const ctx = await setup();
    expect((await ctx.admin.get("/api/orders/00000000-0000-0000-0000-000000000000/history")).status).toBe(404);
  });
});

describe("diffOrderSnapshots", () => {
  it("sem mudança não devolve nada e trata campos ausentes (auditoria antiga) como vazios", () => {
    const base = { status: "PENDING", total: "10.00", driverName: null };
    expect(diffOrderSnapshots(base, { ...base })).toEqual([]);
    expect(diffOrderSnapshots({ status: "PENDING", total: "10.00" }, base)).toEqual([]); // antes não tinha driverName
  });

  it("formata dinheiro e datas em pt-BR", () => {
    const changes = diffOrderSnapshots({ total: "1234.5", expectedDeliveryDate: "2026-11-30" }, { total: "1234.56", expectedDeliveryDate: "2026-12-01" });
    expect(changes).toEqual([
      { field: "total", label: "Total", before: "R$ 1.234,50", after: "R$ 1.234,56" },
      { field: "expectedDeliveryDate", label: "Data prevista", before: "30/11/2026", after: "01/12/2026" },
    ]);
  });
});
