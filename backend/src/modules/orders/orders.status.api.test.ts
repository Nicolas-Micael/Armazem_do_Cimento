// Testes de integração do status operacional e do cancelamento (E1):
// transições válidas e inválidas, permissões, concorrência, cancelamento com pagamentos e integridade.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestUser, loginAs, resetDatabase } from "../../../tests/helpers.js";
import { todayInBusinessZone } from "../dashboard/dashboard.period.js";

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

type Agent = Awaited<ReturnType<typeof loginAs>>;
type OrderRef = { id: string; version: number };

async function setup() {
  await createTestUser({ username: "chefe", role: "ADMIN" });
  await createTestUser({ username: "caixa1", role: "FINANCEIRO" });
  const customer = await prisma.customer.create({ data: { name: "Construtora Exemplo", document: "11222333000181" } });
  const product = await prisma.product.create({ data: { name: "Cimento CP II 50kg", currentPrice: "100.00" } });
  const admin = await loginAs(app, "chefe");
  const financeiro = await loginAs(app, "caixa1");
  const accounts = (await admin.get("/api/receiving-accounts")).body.accounts as { id: string; code: string }[];
  const account = (code: string) => accounts.find((item) => item.code === code)!.id;

  /** Cria saída de quantity × R$ 100,00 (padrão 10 = R$ 1.000,00). `confirm: false` deixa Pendente. */
  async function order(options: { deliveryMode?: "DELIVERY" | "PICKUP"; quantity?: number; confirm?: boolean } = {}): Promise<OrderRef> {
    const created = await financeiro.post("/api/orders").send({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: options.quantity ?? 10 }],
      paymentTerm: "IMMEDIATE",
      deliveryMode: options.deliveryMode ?? "DELIVERY",
    });
    expect(created.status).toBe(201);
    let ref = created.body.order as OrderRef;
    if (options.confirm !== false) {
      const confirmed = await admin.post(`/api/orders/${ref.id}/confirm`).send({ version: ref.version });
      expect(confirmed.status).toBe(200);
      ref = confirmed.body.order;
    }
    return ref;
  }
  return { admin, financeiro, account, order };
}

/** Avança e devolve a saída atualizada (confere o 200). */
async function advance(agent: Agent, ref: OrderRef, to: string, extra: object = {}) {
  const response = await agent.post(`/api/orders/${ref.id}/advance`).send({ to, version: ref.version, ...extra });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.order as OrderRef & { status: string; actualDeliveryDate: string | null };
}

const today = todayInBusinessZone();

describe("avançar o status (ADM e Financeiro)", () => {
  it("entrega: Confirmado → Em separação → Saiu para entrega → Concluído, com versão, histórico e auditoria", async () => {
    const { admin, financeiro, order } = await setup();
    const o = await order();
    const picking = await advance(financeiro, o, "PICKING"); // Financeiro também avança
    expect(picking).toMatchObject({ status: "PICKING", version: o.version + 1 });
    const out = await advance(admin, picking, "OUT_FOR_DELIVERY", { note: "Caminhão 2" });
    const done = await advance(financeiro, out, "COMPLETED");
    expect(done).toMatchObject({ status: "COMPLETED", version: o.version + 3, actualDeliveryDate: today });

    const history = (await admin.get(`/api/orders/${o.id}`)).body.order.statusHistory as { fromStatus: string | null; toStatus: string; changedBy: string; note: string | null }[];
    expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
      [null, "PENDING"], ["PENDING", "CONFIRMED"], ["CONFIRMED", "PICKING"], ["PICKING", "OUT_FOR_DELIVERY"], ["OUT_FOR_DELIVERY", "COMPLETED"],
    ]);
    expect(history[2]!.changedBy).toBe("Teste caixa1");
    expect(history[3]).toMatchObject({ changedBy: "Teste chefe", note: "Caminhão 2" });
    expect(await prisma.auditLog.count({ where: { action: "order.advance", entityId: o.id } })).toBe(3);
  });

  it("entrega não pula etapa; Pendente não avança (precisa confirmar); definitivos não avançam", async () => {
    const { admin, order } = await setup();
    const o = await order();
    const skip = await admin.post(`/api/orders/${o.id}/advance`).send({ to: "OUT_FOR_DELIVERY", version: o.version });
    expect(skip.status).toBe(409);
    expect(skip.body.error.message).toContain("Em separação");
    const picking = await advance(admin, o, "PICKING");
    expect((await admin.post(`/api/orders/${o.id}/advance`).send({ to: "COMPLETED", version: picking.version })).status).toBe(409); // entrega: sem atalho
    expect((await admin.post(`/api/orders/${o.id}/advance`).send({ to: "CONFIRMED", version: picking.version })).status).toBe(400); // não é destino válido

    const draft = await order({ confirm: false });
    const pending = await admin.post(`/api/orders/${draft.id}/advance`).send({ to: "PICKING", version: draft.version });
    expect(pending.status).toBe(409);
    expect(pending.body.error.message).toContain("Confirme");
  });

  it("retirada pode ir de Em separação direto para Concluído", async () => {
    const { admin, order } = await setup();
    const o = await order({ deliveryMode: "PICKUP" });
    const picking = await advance(admin, o, "PICKING");
    expect(await advance(admin, picking, "COMPLETED")).toMatchObject({ status: "COMPLETED" });
  });

  it("Concluído é definitivo: não avança, não retorna, não cancela", async () => {
    const { admin, order } = await setup();
    const o = await order({ deliveryMode: "PICKUP" });
    const done = await advance(admin, await advance(admin, o, "PICKING"), "COMPLETED");
    expect((await admin.post(`/api/orders/${o.id}/advance`).send({ to: "COMPLETED", version: done.version })).status).toBe(409);
    expect((await admin.post(`/api/orders/${o.id}/revert`).send({ version: done.version, reason: "Engano" })).status).toBe(409);
    expect((await admin.post(`/api/orders/${o.id}/cancel`).send({ version: done.version, reason: "Engano" })).status).toBe(409);
  });

  it("concluir não exige quitação: conclui com saldo a receber", async () => {
    const { admin, order } = await setup();
    const o = await order({ deliveryMode: "PICKUP" });
    const done = await advance(admin, await advance(admin, o, "PICKING"), "COMPLETED");
    expect(done.status).toBe("COMPLETED");
    const summary = (await admin.get(`/api/orders/${o.id}/payments`)).body.summary;
    expect(summary).toMatchObject({ received: "0.00", balance: "1000.00" });
  });
});

describe("data efetiva da entrega/retirada (usa o campo actual_delivery_date existente)", () => {
  async function toPicking() {
    const ctx = await setup();
    const o = await ctx.order({ deliveryMode: "PICKUP" });
    return { ...ctx, picking: await advance(ctx.admin, o, "PICKING") };
  }

  it("padrão: hoje; pode ser informada (hoje ou depois do registro, nunca no futuro)", async () => {
    const { admin, picking } = await toPicking();
    const done = await advance(admin, picking, "COMPLETED", { deliveredAt: today });
    expect(done.actualDeliveryDate).toBe(today);
    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: picking.id } });
    expect(persisted.actualDeliveryDate!.toISOString().slice(0, 10)).toBe(today);
  });

  it("recusa data no futuro e data anterior ao registro, e não muda o status", async () => {
    const { admin, picking } = await toPicking();
    const future = await admin.post(`/api/orders/${picking.id}/advance`).send({ to: "COMPLETED", version: picking.version, deliveredAt: "2999-01-01" });
    expect(future.status).toBe(400);
    const past = await admin.post(`/api/orders/${picking.id}/advance`).send({ to: "COMPLETED", version: picking.version, deliveredAt: "2020-01-01" });
    expect(past.status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: picking.id } })).status).toBe("PICKING");
  });

  it("a data só vale ao concluir; formato inválido é recusado", async () => {
    const { admin, order } = await setup();
    const o = await order();
    expect((await admin.post(`/api/orders/${o.id}/advance`).send({ to: "PICKING", version: o.version, deliveredAt: today })).status).toBe(400);
    expect((await admin.post(`/api/orders/${o.id}/advance`).send({ to: "PICKING", version: o.version, deliveredAt: "26/11/2026" })).status).toBe(400);
  });
});

describe("retornar status (só ADM, um passo, com motivo)", () => {
  it("Financeiro não retorna (403); ADM retorna um passo com motivo, que fica no histórico e na auditoria", async () => {
    const { admin, financeiro, order } = await setup();
    const o = await order();
    const out = await advance(admin, await advance(admin, o, "PICKING"), "OUT_FOR_DELIVERY");
    expect((await financeiro.post(`/api/orders/${o.id}/revert`).send({ version: out.version, reason: "Caminhão voltou" })).status).toBe(403);

    const reverted = await admin.post(`/api/orders/${o.id}/revert`).send({ version: out.version, reason: "Caminhão voltou" });
    expect(reverted.status).toBe(200);
    expect(reverted.body.order.status).toBe("PICKING");
    expect(reverted.body.order.version).toBe(out.version + 1);
    expect(reverted.body.order.statusHistory.at(-1)).toMatchObject({ fromStatus: "OUT_FOR_DELIVERY", toStatus: "PICKING", note: "Caminhão voltou", changedBy: "Teste chefe" });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "order.revert", entityId: o.id } });
    expect((audit.after as { reason: string }).reason).toBe("Caminhão voltou");

    const again = await admin.post(`/api/orders/${o.id}/revert`).send({ version: reverted.body.order.version, reason: "Mais um" });
    expect(again.body.order.status).toBe("CONFIRMED"); // um passo por vez
  });

  it("motivo obrigatório (mínimo 3 caracteres) e nada muda sem ele", async () => {
    const { admin, order } = await setup();
    const o = await advance(admin, await order(), "PICKING");
    for (const reason of [undefined, "", "  ", "ab"]) {
      expect((await admin.post(`/api/orders/${o.id}/revert`).send({ version: o.version, reason })).status, String(reason)).toBe(400);
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PICKING");
  });

  it("Confirmado não volta a Pendente; Pendente e Cancelado não retornam", async () => {
    const { admin, order } = await setup();
    const confirmed = await order();
    expect((await admin.post(`/api/orders/${confirmed.id}/revert`).send({ version: confirmed.version, reason: "Voltar" })).status).toBe(409);
    const draft = await order({ confirm: false });
    expect((await admin.post(`/api/orders/${draft.id}/revert`).send({ version: draft.version, reason: "Voltar" })).status).toBe(409);
    const cancelled = await admin.post(`/api/orders/${confirmed.id}/cancel`).send({ version: confirmed.version, reason: "Desistência" });
    expect((await admin.post(`/api/orders/${confirmed.id}/revert`).send({ version: cancelled.body.order.version, reason: "Voltar" })).status).toBe(409);
  });
});

describe("cancelar (só ADM, com motivo)", () => {
  it("Financeiro não cancela (403)", async () => {
    const { financeiro, order } = await setup();
    const o = await order();
    expect((await financeiro.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Desistência" })).status).toBe(403);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("CONFIRMED");
  });

  it("cancela Pendente (rascunho), Confirmado e Em separação, com histórico, auditoria e motivo; nada é apagado", async () => {
    const { admin, order } = await setup();
    const draft = await order({ confirm: false });
    const confirmed = await order();
    const picking = await advance(admin, await order(), "PICKING");
    for (const [ref, from] of [[draft, "PENDING"], [confirmed, "CONFIRMED"], [picking, "PICKING"]] as const) {
      const response = await admin.post(`/api/orders/${ref.id}/cancel`).send({ version: ref.version, reason: "Cliente desistiu" });
      expect(response.status, from).toBe(200);
      expect(response.body.order.status).toBe("CANCELLED");
      expect(response.body.order.version).toBe(ref.version + 1);
      expect(response.body.order.statusHistory.at(-1)).toMatchObject({ fromStatus: from, toStatus: "CANCELLED", note: "Cliente desistiu", changedBy: "Teste chefe" });
      const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "order.cancel", entityId: ref.id } });
      expect((audit.before as { status: string }).status).toBe(from);
      expect((audit.after as { status: string; reason: string }).status).toBe("CANCELLED");
      expect((audit.after as { reason: string }).reason).toBe("Cliente desistiu");
      // Continua no banco, com itens e total.
      const kept = await prisma.order.findUniqueOrThrow({ where: { id: ref.id }, include: { items: true } });
      expect(kept.items).toHaveLength(1);
      expect(kept.total.toFixed(2)).toBe("1000.00");
    }
    expect(await prisma.order.count()).toBe(3);
    // Aparece no histórico da tela, com o motivo.
    const history = (await admin.get(`/api/orders/${draft.id}/history`)).body.events as { title: string; reason: string | null }[];
    expect(history.at(-1)).toMatchObject({ title: "Saída cancelada", reason: "Cliente desistiu" });
  });

  it("não cancela Saiu para entrega nem Concluído; não cancela duas vezes", async () => {
    const { admin, order } = await setup();
    const out = await advance(admin, await advance(admin, await order(), "PICKING"), "OUT_FOR_DELIVERY");
    const refused = await admin.post(`/api/orders/${out.id}/cancel`).send({ version: out.version, reason: "Desistência" });
    expect(refused.status).toBe(409);
    const o = await order();
    const cancelled = await admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Desistência" });
    expect((await admin.post(`/api/orders/${o.id}/cancel`).send({ version: cancelled.body.order.version, reason: "Outra vez" })).status).toBe(409);
  });

  it("motivo obrigatório (mínimo 3 caracteres)", async () => {
    const { admin, order } = await setup();
    const o = await order();
    for (const reason of [undefined, "", "   ", "ab"]) {
      expect((await admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason })).status, String(reason)).toBe(400);
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("CONFIRMED");
  });

  it("saída cancelada não é editada, não é confirmada, não recebe pagamento nem sai do histórico; some dos indicadores", async () => {
    const { admin, financeiro, order } = await setup();
    const o = await order();
    const cancelled = (await admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Desistência" })).body.order;
    expect((await admin.post(`/api/orders/${o.id}/confirm`).send({ version: cancelled.version })).status).toBe(409);
    expect((await financeiro.put(`/api/orders/${o.id}`).send({ version: cancelled.version, customerId: cancelled.customerId, items: [], paymentTerm: "IMMEDIATE", deliveryMode: "PICKUP" })).status).toBeGreaterThanOrEqual(400);
    expect((await admin.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "10.00" })).status).toBe(409);
    expect((await admin.post(`/api/orders/${o.id}/advance`).send({ to: "PICKING", version: cancelled.version })).status).toBe(409);
    const dash = (await admin.get(`/api/dashboard?from=${today}&to=${today}`)).body;
    expect(dash.totals.ordersCount).toBe(0);
    expect(dash.financial.receivable).toBe("0.00");
  });
});

describe("cancelamento com pagamentos (decisão 5)", () => {
  const checkBody = { method: "CHECK", amount: "100.00", check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" } };

  it("pagamento Confirmado bloqueia o cancelamento e a mensagem explica a devolução efetiva do dinheiro", async () => {
    const { admin, order } = await setup();
    const o = await order();
    await admin.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "250.00" }); // Confirmado
    const response = await admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Desistência" });
    expect(response.status).toBe(409);
    const message = response.body.error.message as string;
    expect(message).toContain("R$ 250,00");
    expect(message).toContain("devolver o dinheiro ao cliente");
    expect(message).toContain("não comprova");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("CONFIRMED");
    expect(await prisma.orderStatusHistory.count({ where: { orderId: o.id, toStatus: "CANCELLED" } })).toBe(0);
  });

  it("Confirmado bloqueia mesmo com outros pagamentos pendentes (a regra do Confirmado vem primeiro)", async () => {
    const { admin, account, order } = await setup();
    const o = await order();
    await admin.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "100.00" });
    await admin.post(`/api/orders/${o.id}/payments`).send({ method: "PIX", amount: "100.00", accountId: account("BRADESCO") });
    const response = await admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Desistência" });
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain("devolver o dinheiro");
  });

  it("pagamentos Pendente e A compensar precisam ser estornados antes; depois disso cancela, sem apagar nada", async () => {
    const { admin, account, order } = await setup();
    const o = await order();
    const pix = await admin.post(`/api/orders/${o.id}/payments`).send({ method: "PIX", amount: "100.00", accountId: account("BRADESCO") });
    const check = await admin.post(`/api/orders/${o.id}/payments`).send(checkBody);

    const blocked = await admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Desistência" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toContain("Estorne");
    expect(blocked.body.error.message).toContain("R$ 200,00");

    await admin.post(`/api/payments/${pix.body.payment.id}/reverse`).send({ reason: "Cliente desistiu" });
    expect((await admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Desistência" })).status).toBe(409); // cheque ainda a compensar
    await admin.post(`/api/payments/${check.body.payment.id}/reverse`).send({ reason: "Cliente desistiu" });

    const done = await admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Desistência" });
    expect(done.status).toBe(200);
    expect(await prisma.payment.count({ where: { orderId: o.id } })).toBe(2); // lançamentos preservados
    expect(await prisma.payment.count({ where: { orderId: o.id, status: "REVERSED" } })).toBe(2);
  });

  it("cancelar sem nenhum pagamento funciona; os valores da saída não mudam", async () => {
    const { admin, order } = await setup();
    const o = await order();
    const done = await admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Desistência" });
    expect(done.status).toBe(200);
    expect(done.body.order.total).toBe("1000.00");
  });

  it("P-E-1 (provisório): pagamento que foi Confirmado e estornado não bloqueia, mas fica registrado na auditoria", async () => {
    const { admin, order } = await setup();
    const o = await order();
    const cash = await admin.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "100.00" });
    await admin.post(`/api/payments/${cash.body.payment.id}/reverse`).send({ reason: "Lançado por engano" });
    expect((await admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Desistência" })).status).toBe(200);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "order.cancel", entityId: o.id } });
    expect((audit.after as { reversedPaymentsThatWereConfirmed: number }).reversedPaymentsThatWereConfirmed).toBe(1);
  });
});

describe("concorrência e versionamento", () => {
  it("versão antiga é recusada (409) em avançar, retornar e cancelar", async () => {
    const { admin, order } = await setup();
    const o = await order();
    const moved = await advance(admin, o, "PICKING"); // versão do "o" ficou velha
    expect((await admin.post(`/api/orders/${o.id}/advance`).send({ to: "OUT_FOR_DELIVERY", version: o.version })).status).toBe(409);
    expect((await admin.post(`/api/orders/${o.id}/revert`).send({ version: o.version, reason: "Engano" })).status).toBe(409);
    expect((await admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Engano" })).status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PICKING");
    expect(moved.version).toBe(o.version + 1);
  });

  it("dois avanços simultâneos com a mesma versão: um vence, o outro recebe 409 e só há uma mudança no histórico", async () => {
    const { admin, financeiro, order } = await setup();
    const o = await order();
    const results = await Promise.all([
      admin.post(`/api/orders/${o.id}/advance`).send({ to: "PICKING", version: o.version }),
      financeiro.post(`/api/orders/${o.id}/advance`).send({ to: "PICKING", version: o.version }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: o.id, toStatus: "PICKING" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "order.advance", entityId: o.id } })).toBe(1);
  });

  it("avançar e cancelar ao mesmo tempo: só um é aplicado", async () => {
    const { admin, financeiro, order } = await setup();
    const o = await order();
    const results = await Promise.all([
      financeiro.post(`/api/orders/${o.id}/advance`).send({ to: "PICKING", version: o.version }),
      admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Desistência" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const final = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(["PICKING", "CANCELLED"]).toContain(final.status);
    expect(final.version).toBe(o.version + 1);
  });

  it("cancelar e registrar pagamento ao mesmo tempo nunca deixa pagamento ativo numa saída cancelada", async () => {
    const { admin, financeiro, order } = await setup();
    const outcomes: string[] = [];
    for (let round = 0; round < 6; round++) {
      const o = await order();
      const [cancel, pay] = await Promise.all([
        admin.post(`/api/orders/${o.id}/cancel`).send({ version: o.version, reason: "Desistência" }),
        financeiro.post(`/api/orders/${o.id}/payments`).send({ method: "CASH", amount: "100.00" }),
      ]);
      const final = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
      const active = await prisma.payment.count({ where: { orderId: o.id, status: { not: "REVERSED" } } });
      // Invariante: cancelada ⇒ sem pagamento ativo. E exatamente um dos dois deu certo.
      expect(final.status === "CANCELLED" && active > 0, `rodada ${round}`).toBe(false);
      expect([cancel.status, pay.status].filter((s) => s < 300)).toHaveLength(1);
      outcomes.push(final.status);
    }
    expect(outcomes.length).toBe(6);
  });
});

describe("permissões e integridade", () => {
  it("sem login: 401 em avançar, retornar e cancelar", async () => {
    const { order } = await setup();
    const o = await order();
    const anon = request(app);
    expect((await anon.post(`/api/orders/${o.id}/advance`).send({})).status).toBe(401);
    expect((await anon.post(`/api/orders/${o.id}/revert`).send({})).status).toBe(401);
    expect((await anon.post(`/api/orders/${o.id}/cancel`).send({})).status).toBe(401);
  });

  it("saída inexistente: 404", async () => {
    const { admin } = await setup();
    expect((await admin.post("/api/orders/nao-existe/advance").send({ to: "PICKING", version: 1 })).status).toBe(404);
    expect((await admin.post("/api/orders/nao-existe/cancel").send({ version: 1, reason: "Teste" })).status).toBe(404);
  });

  it("depois de confirmada a saída continua travada: valores não mudam em nenhum status", async () => {
    const { admin, financeiro, order } = await setup();
    const o = await order();
    const picking = await advance(admin, o, "PICKING");
    const edit = await financeiro.put(`/api/orders/${o.id}`).send({ version: picking.version, customerId: (await prisma.customer.findFirstOrThrow()).id, items: [], paymentTerm: "IMMEDIATE", deliveryMode: "DELIVERY" });
    expect(edit.status).toBeGreaterThanOrEqual(400);
    const kept = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(kept.total.toFixed(2)).toBe("1000.00");
  });

  it("não existe rota para apagar saída", async () => {
    const { admin, order } = await setup();
    const o = await order();
    expect([404, 405]).toContain((await admin.delete(`/api/orders/${o.id}`)).status);
    expect(await prisma.order.count()).toBe(1);
  });

  it("os indicadores continuam contando Confirmado, Em separação, Saiu para entrega e Concluído, e não Cancelado", async () => {
    const { admin, order } = await setup();
    const a = await order(); // fica Confirmado
    const b = await advance(admin, await order(), "PICKING");
    const c = await advance(admin, await advance(admin, await order(), "PICKING"), "OUT_FOR_DELIVERY");
    const d = await advance(admin, await advance(admin, await order({ deliveryMode: "PICKUP" }), "PICKING"), "COMPLETED");
    const e = await order();
    await admin.post(`/api/orders/${e.id}/cancel`).send({ version: e.version, reason: "Desistência" });
    expect([a, b, c, d].length).toBe(4);
    const dash = (await admin.get(`/api/dashboard?from=${today}&to=${today}`)).body;
    expect(dash.totals.ordersCount).toBe(4);
    expect(dash.financial.receivable).toBe("4000.00");
  });
});
