// Testes dos indicadores financeiros do painel e do saldo na lista de saídas (etapa D2).
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestUser, loginAs, resetDatabase } from "../../../tests/helpers.js";
import { todayInBusinessZone } from "./dashboard.period.js";

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function setup() {
  await createTestUser({ username: "chefe", role: "ADMIN" });
  await createTestUser({ username: "caixa1", role: "FINANCEIRO" });
  const customer = await prisma.customer.create({ data: { name: "Construtora Exemplo", document: "11222333000181" } });
  const product = await prisma.product.create({ data: { name: "Cimento CP II 50kg", currentPrice: "100.00" } });
  const admin = await loginAs(app, "chefe");
  const accounts = (await admin.get("/api/receiving-accounts")).body.accounts as { id: string; code: string }[];
  const account = (code: string) => accounts.find((item) => item.code === code)!.id;

  /** Saída de quantity × R$ 100,00; confirmada por padrão. */
  async function order(quantity: number, paymentTerm = "IMMEDIATE", confirm = true) {
    const created = await admin.post("/api/orders").send({
      customerId: customer.id, items: [{ productId: product.id, quantity }], paymentTerm, deliveryMode: "PICKUP",
    });
    let body = created.body.order as { id: string; version: number };
    if (confirm) body = (await admin.post(`/api/orders/${body.id}/confirm`).send({ version: body.version })).body.order;
    return body;
  }
  return { admin, account, order };
}

const today = todayInBusinessZone();
const dashboard = async (admin: Awaited<ReturnType<typeof setup>>["admin"], from = today, to = today) =>
  (await admin.get(`/api/dashboard?from=${from}&to=${to}`)).body.financial;

describe("indicadores financeiros do painel", () => {
  it("sem pagamentos: tudo zerado (nada inventado)", async () => {
    const { admin } = await setup();
    expect(await dashboard(admin)).toEqual({
      received: { total: "0.00", confirmed: "0.00", reversed: "0.00", paymentsCount: 0 },
      receivedByMethod: [],
      receivedByAccount: [],
      receivable: "0.00",
      toClear: { total: "0.00", paymentsCount: 0 },
      pendingConference: { total: "0.00", paymentsCount: 0 },
      overdue: { total: "0.00", dueDatesCount: 0, ordersCount: 0 },
    });
  });

  it("recebido conta só Confirmados; Pendente e A compensar ficam à parte; Estornado não soma", async () => {
    const { admin, account, order } = await setup();
    const o = await order(10); // 1.000,00
    await admin.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "100.00" }); // Confirmado
    await admin.post(`/api/orders/${o.id}/payments`).send({ method: "PIX", amount: "200.00", accountId: account("BRADESCO") }); // Pendente
    await admin.post(`/api/orders/${o.id}/payments`).send({
      method: "CHECK", amount: "300.00", check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" },
    }); // A compensar
    const reversed = await admin.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "50.00" });
    await admin.post(`/api/payments/${reversed.body.payment.id}/reverse`).send({ reason: "Erro" });

    const f = await dashboard(admin);
    // 100 + 50 confirmados, 50 estornados (confirmado e estornado hoje) → líquido 100.
    expect(f.received).toEqual({ total: "100.00", confirmed: "150.00", reversed: "50.00", paymentsCount: 1 });
    expect(f.pendingConference).toEqual({ total: "200.00", paymentsCount: 1 });
    expect(f.toClear).toEqual({ total: "300.00", paymentsCount: 1 });
    expect(f.receivable).toBe("900.00"); // 1.000 − 100 Confirmados
  });

  it("por meio e por conta: usa a conta atual (cheque compensado no Bradesco aparece no Bradesco)", async () => {
    const { admin, account, order } = await setup();
    const o = await order(10);
    await admin.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "100.00" });
    const pix = await admin.post(`/api/orders/${o.id}/payments`).send({ method: "PIX", amount: "200.00", accountId: account("CAIXA_ECONOMICA") });
    await admin.post(`/api/payments/${pix.body.payment.id}/confirm`).send({});
    const check = await admin.post(`/api/orders/${o.id}/payments`).send({
      method: "CHECK", amount: "300.00", check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" },
    });
    await admin.post(`/api/payments/${check.body.payment.id}/clear`).send({ accountId: account("BRADESCO") });

    const f = await dashboard(admin);
    expect(f.received.total).toBe("600.00");
    expect(f.receivedByMethod).toEqual([
      { method: "CHECK", total: "300.00", paymentsCount: 1 },
      { method: "PIX", total: "200.00", paymentsCount: 1 },
      { method: "CASH", total: "100.00", paymentsCount: 1 },
    ]);
    expect(f.receivedByAccount.map((a: { accountName: string; total: string }) => [a.accountName, a.total])).toEqual([
      ["Bradesco", "300.00"],
      ["Caixa Econômica Federal", "200.00"],
      ["Caixa físico da empresa", "100.00"],
    ]);
  });

  /** Move um evento do histórico (confirmação ou estorno) para outra data, simulando que ocorreu antes. */
  async function moveEvent(paymentId: string, toStatus: "CONFIRMED" | "REVERSED", at: string) {
    await prisma.paymentStatusHistory.updateMany({ where: { paymentId, toStatus }, data: { changedAt: new Date(at) } });
  }

  it("recebido respeita o período pela data da confirmação (fuso de Brasília)", async () => {
    const { admin, order } = await setup();
    const o = await order(10);
    const p = await admin.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "100.00" });
    await moveEvent(p.body.payment.id, "CONFIRMED", "2026-10-15T12:00:00Z");
    expect((await dashboard(admin)).received.total).toBe("0.00");
    expect((await dashboard(admin, "2026-10-15", "2026-10-15")).received.total).toBe("100.00");
    // 01:00 UTC de 16/10 ainda é 22:00 de 15/10 em Brasília.
    await moveEvent(p.body.payment.id, "CONFIRMED", "2026-10-16T01:00:00Z");
    expect((await dashboard(admin, "2026-10-15", "2026-10-15")).received.total).toBe("100.00");
    expect((await dashboard(admin, "2026-10-16", "2026-10-16")).received.total).toBe("0.00");
  });

  it("cheque conta na data da compensação, não na data em que foi recebido", async () => {
    const { admin, account, order } = await setup();
    const o = await order(10);
    const check = await admin.post(`/api/orders/${o.id}/payments`).send({
      method: "CHECK", amount: "300.00", receivedAt: "2026-10-01", check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" },
    });
    expect((await dashboard(admin, "2026-10-01", "2026-10-01")).received.total).toBe("0.00");
    await admin.post(`/api/payments/${check.body.payment.id}/clear`).send({ accountId: account("BRADESCO") });
    expect((await dashboard(admin)).received.total).toBe("300.00");
    expect((await dashboard(admin, "2026-10-01", "2026-10-01")).received.total).toBe("0.00");
  });

  describe("estornos (a confirmação soma na data dela; o estorno subtrai na data dele)", () => {
    it("confirmar e estornar no mesmo período: efeito líquido zero, e o saldo da saída é restaurado", async () => {
      const { admin, order } = await setup();
      const o = await order(10);
      const p = await admin.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "100.00" });
      await admin.post(`/api/payments/${p.body.payment.id}/reverse`).send({ reason: "Erro de lançamento" });
      const f = await dashboard(admin);
      expect(f.received).toEqual({ total: "0.00", confirmed: "100.00", reversed: "100.00", paymentsCount: 0 });
      expect(f.receivedByMethod).toEqual([]);
      expect(f.receivedByAccount).toEqual([]);
      expect(f.receivable).toBe("1000.00");
      expect((await admin.get(`/api/orders/${o.id}/payments`)).body.summary.balance).toBe("1000.00");
    });

    it("estorno em período posterior: o período da confirmação continua com o valor e o do estorno fica negativo", async () => {
      const { admin, order } = await setup();
      const o = await order(10);
      const p = await admin.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "100.00" });
      await moveEvent(p.body.payment.id, "CONFIRMED", "2026-10-15T12:00:00Z"); // confirmado em outubro
      await admin.post(`/api/payments/${p.body.payment.id}/reverse`).send({ reason: "Devolução" }); // estornado hoje
      expect((await dashboard(admin, "2026-10-01", "2026-10-31")).received.total).toBe("100.00");
      const now = await dashboard(admin);
      expect(now.received).toMatchObject({ total: "-100.00", confirmed: "0.00", reversed: "100.00" });
      expect(now.receivedByMethod).toEqual([{ method: "CASH", total: "-100.00", paymentsCount: -1 }]);
      // Período que cobre os dois: líquido zero.
      expect((await dashboard(admin, "2026-10-01", today)).received.total).toBe("0.00");
    });

    it("estornar pagamento que ainda não estava Confirmado (Pix pendente, cheque a compensar) não altera o recebido", async () => {
      const { admin, account, order } = await setup();
      const o = await order(10);
      const pix = await admin.post(`/api/orders/${o.id}/payments`).send({ method: "PIX", amount: "100.00", accountId: account("BRADESCO") });
      const check = await admin.post(`/api/orders/${o.id}/payments`).send({
        method: "CHECK", amount: "100.00", check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" },
      });
      await admin.post(`/api/payments/${pix.body.payment.id}/reverse`).send({ reason: "Não caiu" });
      await admin.post(`/api/payments/${check.body.payment.id}/reverse`).send({ reason: "Devolvido" });
      expect((await dashboard(admin)).received).toEqual({ total: "0.00", confirmed: "0.00", reversed: "0.00", paymentsCount: 0 });
    });

    it("cheque compensado e depois devolvido: soma na compensação e subtrai no estorno, na conta onde foi compensado", async () => {
      const { admin, account, order } = await setup();
      const o = await order(10);
      const check = await admin.post(`/api/orders/${o.id}/payments`).send({
        method: "CHECK", amount: "300.00", check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" },
      });
      await admin.post(`/api/payments/${check.body.payment.id}/clear`).send({ accountId: account("BRADESCO") });
      await moveEvent(check.body.payment.id, "CONFIRMED", "2026-10-15T12:00:00Z");
      await admin.post(`/api/payments/${check.body.payment.id}/reverse`).send({ reason: "Cheque devolvido por falta de fundos" });
      const oct = await dashboard(admin, "2026-10-15", "2026-10-15");
      expect(oct.receivedByAccount.map((a: { accountName: string; total: string }) => [a.accountName, a.total])).toEqual([["Bradesco", "300.00"]]);
      const now = await dashboard(admin);
      expect(now.receivedByAccount.map((a: { accountName: string; total: string }) => [a.accountName, a.total])).toEqual([["Bradesco", "-300.00"]]);
    });

    it("estornos não apagam nada: o lançamento e o histórico continuam no banco", async () => {
      const { admin, order } = await setup();
      const o = await order(10);
      const p = await admin.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "100.00" });
      await admin.post(`/api/payments/${p.body.payment.id}/reverse`).send({ reason: "Erro" });
      expect(await prisma.payment.count()).toBe(1);
      expect(await prisma.paymentStatusHistory.count({ where: { paymentId: p.body.payment.id } })).toBe(2);
    });
  });

  it("a receber só considera saídas efetivadas (pendentes e canceladas ficam de fora)", async () => {
    const { admin, order } = await setup();
    await order(10); // 1.000 confirmada
    await order(5, "IMMEDIATE", false); // pendente
    const cancelled = await order(7);
    await prisma.order.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });
    expect((await dashboard(admin)).receivable).toBe("1000.00");
  });

  it("em atraso: vencimento passado menos o recebido Confirmado; Pendente não abate", async () => {
    const { admin, account, order } = await setup();
    const o = await order(10, "TERM_10_DAYS");
    await prisma.orderDueDate.updateMany({ where: { orderId: o.id }, data: { dueDate: new Date("2020-01-01T00:00:00Z") } });
    expect((await dashboard(admin)).overdue).toEqual({ total: "1000.00", dueDatesCount: 1, ordersCount: 1 });
    await admin.post(`/api/orders/${o.id}/payments`).send({ method: "PIX", amount: "400.00", accountId: account("BRADESCO") }); // Pendente
    expect((await dashboard(admin)).overdue.total).toBe("1000.00");
    await admin.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "250.50" }); // Confirmado
    expect((await dashboard(admin)).overdue.total).toBe("749.50");
  });

  it("vencimento futuro não é atraso", async () => {
    const { admin, order } = await setup();
    await order(10, "TERM_30_DAYS");
    expect((await dashboard(admin)).overdue).toEqual({ total: "0.00", dueDatesCount: 0, ordersCount: 0 });
  });
});

describe("saldo na lista de saídas", () => {
  it("cada saída mostra recebido e saldo a receber; pendente não tem saldo", async () => {
    const { admin, order } = await setup();
    const confirmed = await order(10);
    const pending = await order(5, "IMMEDIATE", false);
    await admin.post(`/api/orders/${confirmed.id}/payments`).send({ method: "CASH", amount: "250.50" });
    const { orders } = (await admin.get("/api/orders")).body as { orders: { id: string; received: string; balance: string | null }[] };
    expect(orders.find((o) => o.id === confirmed.id)).toMatchObject({ received: "250.50", balance: "749.50" });
    expect(orders.find((o) => o.id === pending.id)).toMatchObject({ received: "0.00", balance: null });
  });
});
