// Testes de integração dos pagamentos (D1): elegibilidade, situação inicial, contas, limite,
// compensação de cheque, estorno, permissões, concorrência e vencimentos.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";
import { createTestUser, loginAs, resetDatabase } from "../../../tests/helpers.js";

const app = createApp();

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

type Agent = Awaited<ReturnType<typeof loginAs>>;

/** Cria saída (produto de R$ 100,00 × quantidade) e, por padrão, já confirma. Total = quantity × 100. */
async function setup(options: { quantity?: number; paymentTerm?: string; confirm?: boolean } = {}) {
  await createTestUser({ username: "chefe", role: "ADMIN" });
  await createTestUser({ username: "caixa1", role: "FINANCEIRO" });
  const customer = await prisma.customer.create({ data: { name: "Construtora Exemplo", document: "11222333000181" } });
  const product = await prisma.product.create({ data: { name: "Cimento CP II 50kg", currentPrice: "100.00" } });
  const admin = await loginAs(app, "chefe");
  const financeiro = await loginAs(app, "caixa1");
  const created = await financeiro.post("/api/orders").send({
    customerId: customer.id,
    items: [{ productId: product.id, quantity: options.quantity ?? 10 }],
    paymentTerm: options.paymentTerm ?? "IMMEDIATE",
    deliveryMode: "PICKUP",
  });
  expect(created.status).toBe(201);
  let order = created.body.order as { id: string; version: number; total: string };
  if (options.confirm !== false) {
    const confirmed = await admin.post(`/api/orders/${order.id}/confirm`).send({ version: order.version });
    expect(confirmed.status).toBe(200);
    order = confirmed.body.order;
  }
  const accounts = (await admin.get("/api/receiving-accounts")).body.accounts as { id: string; code: string }[];
  const account = (code: string) => accounts.find((item) => item.code === code)!.id;
  return { admin, financeiro, order, account };
}

const pix = (accountId: string, amount: string) => ({ method: "PIX", amount, accountId });
const getPayments = async (agent: Agent, orderId: string) => (await agent.get(`/api/orders/${orderId}/payments`)).body;

describe("contas de recebimento", () => {
  it("as 4 contas decididas existem (criadas pela migração)", async () => {
    const { admin } = await setup();
    const { accounts } = (await admin.get("/api/receiving-accounts")).body;
    expect(accounts.map((a: { code: string }) => a.code).sort()).toEqual(["BRADESCO", "CAIXA_ECONOMICA", "CASH_BOX", "CHECK_WALLET"]);
  });
});

describe("elegibilidade (decisão 1)", () => {
  it("saída Pendente não recebe pagamento", async () => {
    const { admin, order, account } = await setup({ confirm: false });
    const response = await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "10.00"));
    expect(response.status).toBe(409);
    expect(await prisma.payment.count()).toBe(0);
  });

  it("saída Cancelada não recebe pagamento", async () => {
    const { admin, order, account } = await setup();
    await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    const response = await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "10.00"));
    expect(response.status).toBe(409);
  });

  it.each(["CONFIRMED", "PICKING", "OUT_FOR_DELIVERY", "COMPLETED"] as const)("saída %s recebe pagamento", async (status) => {
    const { admin, order, account } = await setup();
    await prisma.order.update({ where: { id: order.id }, data: { status } });
    const response = await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "10.00"));
    expect(response.status).toBe(201);
  });

  it("saída inexistente: 404", async () => {
    const { admin, account } = await setup();
    const response = await admin.post("/api/orders/nao-existe/payments").send(pix(account("BRADESCO"), "10.00"));
    expect(response.status).toBe(404);
  });
});

describe("situação inicial por meio (decisão 3)", () => {
  it("dinheiro e cartões nascem Confirmado; Pix, depósito e transferência Pendente; cheque A compensar", async () => {
    const { admin, order, account } = await setup({ quantity: 100 });
    const bank = account("BRADESCO");
    const cases: [string, object, string][] = [
      ["CASH", { method: "CASH", amount: "10.00" }, "CONFIRMED"],
      ["DEBIT_CARD", { method: "DEBIT_CARD", amount: "10.00", accountId: bank }, "CONFIRMED"],
      ["CREDIT_CARD", { method: "CREDIT_CARD", amount: "10.00", accountId: bank }, "CONFIRMED"],
      ["PIX", { method: "PIX", amount: "10.00", accountId: bank }, "PENDING"],
      ["DEPOSIT", { method: "DEPOSIT", amount: "10.00", accountId: bank }, "PENDING"],
      ["TRANSFER", { method: "TRANSFER", amount: "10.00", accountId: bank }, "PENDING"],
      ["CHECK", { method: "CHECK", amount: "10.00", check: { number: "000123", bank: "Itaú", expectedClearingDate: "2026-12-10" } }, "TO_CLEAR"],
    ];
    for (const [method, body, expected] of cases) {
      const response = await admin.post(`/api/orders/${order.id}/payments`).send(body);
      expect(response.status, method).toBe(201);
      expect(response.body.payment.status, method).toBe(expected);
    }
  });

  it("o cliente não escolhe a situação: um campo 'status' enviado é ignorado", async () => {
    const { admin, order, account } = await setup();
    const response = await admin.post(`/api/orders/${order.id}/payments`).send({ ...pix(account("BRADESCO"), "10.00"), status: "CONFIRMED" });
    expect(response.status).toBe(201);
    expect(response.body.payment.status).toBe("PENDING");
  });

  it("pagamento só registrado (Pix pendente) não conta como recebido nem reduz o saldo", async () => {
    const { admin, order, account } = await setup();
    await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "400.00"));
    const { summary } = await getPayments(admin, order.id);
    expect(summary).toMatchObject({ received: "0.00", pending: "400.00", balance: "1000.00", available: "600.00" });
  });
});

describe("meio e conta (decisão 4)", () => {
  it("cheque vai sozinho para a Carteira de cheques e dinheiro para o Caixa físico", async () => {
    const { admin, order } = await setup();
    const cash = await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "10.00" });
    expect(cash.body.payment.account.code).toBe("CASH_BOX");
    const check = await admin
      .post(`/api/orders/${order.id}/payments`)
      .send({ method: "CHECK", amount: "10.00", check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" } });
    expect(check.body.payment.account.code).toBe("CHECK_WALLET");
    expect(check.body.payment.check).toEqual({ number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" });
  });

  it("cheque em outra conta e dinheiro em banco são recusados", async () => {
    const { admin, order, account } = await setup();
    const cashInBank = await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "10.00", accountId: account("BRADESCO") });
    expect(cashInBank.status).toBe(400);
    const checkInBank = await admin.post(`/api/orders/${order.id}/payments`).send({
      method: "CHECK", amount: "10.00", accountId: account("BRADESCO"),
      check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" },
    });
    expect(checkInBank.status).toBe(400);
  });

  it("Pix exige conta bancária: sem conta, Caixa físico ou Carteira são recusados", async () => {
    const { admin, order, account } = await setup();
    expect((await admin.post(`/api/orders/${order.id}/payments`).send({ method: "PIX", amount: "10.00" })).status).toBe(400);
    expect((await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("CASH_BOX"), "10.00"))).status).toBe(400);
    expect((await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("CHECK_WALLET"), "10.00"))).status).toBe(400);
    expect((await admin.post(`/api/orders/${order.id}/payments`).send(pix("conta-inexistente", "10.00"))).status).toBe(400);
  });

  it("cheque exige número, banco e data prevista; dados de cheque em outro meio são recusados", async () => {
    const { admin, order, account } = await setup();
    expect((await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CHECK", amount: "10.00" })).status).toBe(400);
    expect((await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CHECK", amount: "10.00", check: { number: "1" } })).status).toBe(400);
    const withCheck = await admin.post(`/api/orders/${order.id}/payments`).send({
      ...pix(account("BRADESCO"), "10.00"),
      check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" },
    });
    expect(withCheck.status).toBe(400);
  });

  it("valor inválido, zero e negativo são recusados", async () => {
    const { admin, order, account } = await setup();
    for (const amount of ["0", "0.00", "-5", "abc", "10.999", ""]) {
      const response = await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), amount));
      expect(response.status, amount).toBe(400);
    }
  });
});

describe("limite da soma (decisão 8)", () => {
  it("exemplo: total 2.000, 500 Confirmados e 1.000 A compensar → só mais 500; saldo a receber 1.500", async () => {
    const { admin, order } = await setup({ quantity: 20 });
    expect(order.total).toBe("2000.00");
    await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "500.00" });
    await admin.post(`/api/orders/${order.id}/payments`).send({
      method: "CHECK", amount: "1000.00", check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" },
    });
    const { summary } = await getPayments(admin, order.id);
    expect(summary).toMatchObject({ received: "500.00", toClear: "1000.00", balance: "1500.00", available: "500.00" });

    const tooMuch = await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "500.01" });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error.message).toContain("R$ 500,00");
    const exact = await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "500.00" });
    expect(exact.status).toBe(201);
    expect((await getPayments(admin, order.id)).summary.available).toBe("0.00");
    expect((await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "0.01" })).status).toBe(409);
  });

  it("pagamento maior que o total da saída é recusado de cara", async () => {
    const { admin, order } = await setup();
    expect((await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "1000.01" })).status).toBe(409);
  });

  it("estorno devolve o valor ao disponível", async () => {
    const { admin, order, account } = await setup();
    const first = await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "1000.00"));
    expect((await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "1.00" })).status).toBe(409);
    await admin.post(`/api/payments/${first.body.payment.id}/reverse`).send({ reason: "Pix não caiu" });
    expect((await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "1000.00" })).status).toBe(201);
  });

  it("concorrência: dois pagamentos de 600 numa saída de 1.000 → só um é aceito", async () => {
    const { admin, financeiro, order } = await setup();
    const results = await Promise.all([
      admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "600.00" }),
      financeiro.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "600.00" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await getPayments(admin, order.id)).summary.available).toBe("400.00");
  });

  it("concorrência: 6 pagamentos de 300 numa saída de 1.000 → exatamente 3 aceitos e nunca passa do total", async () => {
    const { admin, financeiro, order } = await setup();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        (index % 2 ? admin : financeiro).post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "300.00" }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    const sum = await prisma.payment.aggregate({ where: { orderId: order.id }, _sum: { amount: true } });
    expect(sum._sum.amount!.toFixed(2)).toBe("900.00");
  });
});

describe("confirmação do recebimento (decisão 3)", () => {
  it("ADM e Financeiro confirmam Pix pendente; passa a contar como recebido, com histórico e auditoria", async () => {
    const { admin, financeiro, order, account } = await setup();
    const created = await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "400.00"));
    const id = created.body.payment.id as string;
    const confirmed = await financeiro.post(`/api/payments/${id}/confirm`).send({ note: "Conferido no extrato" });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.payment.status).toBe("CONFIRMED");
    expect(confirmed.body.payment.confirmedAt).not.toBeNull();
    const history = confirmed.body.payment.history;
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({ fromStatus: "PENDING", toStatus: "CONFIRMED", changedBy: "Teste caixa1", reason: "Conferido no extrato" });
    expect((await getPayments(admin, order.id)).summary).toMatchObject({ received: "400.00", balance: "600.00", available: "600.00" });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "payment.confirm", entityId: id } });
    expect((audit.before as { status: string }).status).toBe("PENDING");
    expect((audit.after as { status: string }).status).toBe("CONFIRMED");
  });

  it("não confirma duas vezes, nem pagamento estornado, nem cheque (cheque é compensado)", async () => {
    const { admin, order, account } = await setup();
    const created = await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "100.00"));
    const id = created.body.payment.id as string;
    expect((await admin.post(`/api/payments/${id}/confirm`).send({})).status).toBe(200);
    expect((await admin.post(`/api/payments/${id}/confirm`).send({})).status).toBe(409);
    const check = await admin.post(`/api/orders/${order.id}/payments`).send({
      method: "CHECK", amount: "100.00", check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" },
    });
    expect((await admin.post(`/api/payments/${check.body.payment.id}/confirm`).send({})).status).toBe(409);
    const other = await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "100.00"));
    await admin.post(`/api/payments/${other.body.payment.id}/reverse`).send({ reason: "Erro" });
    expect((await admin.post(`/api/payments/${other.body.payment.id}/confirm`).send({})).status).toBe(409);
  });

  it("concorrência: duas confirmações simultâneas → uma vence, a outra recebe 409", async () => {
    const { admin, financeiro, order, account } = await setup();
    const created = await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "100.00"));
    const id = created.body.payment.id as string;
    const results = await Promise.all([admin.post(`/api/payments/${id}/confirm`).send({}), financeiro.post(`/api/payments/${id}/confirm`).send({})]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.paymentStatusHistory.count({ where: { paymentId: id, toStatus: "CONFIRMED" } })).toBe(1);
  });
});

describe("compensação de cheque (decisão 5)", () => {
  const checkBody = { method: "CHECK", amount: "300.00", check: { number: "000456", bank: "Itaú", expectedClearingDate: "2026-12-10" } };

  it("exige a conta de destino bancária; troca de conta fica no histórico e na auditoria", async () => {
    const { admin, order, account } = await setup();
    const created = await admin.post(`/api/orders/${order.id}/payments`).send(checkBody);
    const id = created.body.payment.id as string;

    expect((await admin.post(`/api/payments/${id}/clear`).send({})).status).toBe(400);
    expect((await admin.post(`/api/payments/${id}/clear`).send({ accountId: account("CASH_BOX") })).status).toBe(400);
    expect((await admin.post(`/api/payments/${id}/clear`).send({ accountId: account("CHECK_WALLET") })).status).toBe(400);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).status).toBe("TO_CLEAR");

    const cleared = await admin.post(`/api/payments/${id}/clear`).send({ accountId: account("BRADESCO") });
    expect(cleared.status).toBe(200);
    expect(cleared.body.payment).toMatchObject({ status: "CONFIRMED", account: { code: "BRADESCO" } });
    const history = cleared.body.payment.history;
    expect(history[0]).toMatchObject({ toStatus: "TO_CLEAR", toAccount: "Carteira de cheques" });
    expect(history[1]).toMatchObject({ fromStatus: "TO_CLEAR", toStatus: "CONFIRMED", fromAccount: "Carteira de cheques", toAccount: "Bradesco" });
    expect(await prisma.auditLog.count({ where: { action: "payment.clear", entityId: id } })).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "payment.clear", entityId: id } });
    expect((audit.before as { account: string }).account).toBe("CHECK_WALLET");
    expect((audit.after as { account: string }).account).toBe("BRADESCO");
  });

  it("cheque A compensar não conta como recebido; ao compensar, passa a contar", async () => {
    const { admin, order, account } = await setup();
    const created = await admin.post(`/api/orders/${order.id}/payments`).send(checkBody);
    expect((await getPayments(admin, order.id)).summary).toMatchObject({ received: "0.00", toClear: "300.00", balance: "1000.00" });
    await admin.post(`/api/payments/${created.body.payment.id}/clear`).send({ accountId: account("CAIXA_ECONOMICA") });
    expect((await getPayments(admin, order.id)).summary).toMatchObject({ received: "300.00", toClear: "0.00", balance: "700.00" });
  });

  it("só cheque A compensar é compensado (Pix e cheque já compensado ou estornado são recusados)", async () => {
    const { admin, order, account } = await setup();
    const p = await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "10.00"));
    expect((await admin.post(`/api/payments/${p.body.payment.id}/clear`).send({ accountId: account("BRADESCO") })).status).toBe(409);
    const c = await admin.post(`/api/orders/${order.id}/payments`).send(checkBody);
    await admin.post(`/api/payments/${c.body.payment.id}/clear`).send({ accountId: account("BRADESCO") });
    expect((await admin.post(`/api/payments/${c.body.payment.id}/clear`).send({ accountId: account("BRADESCO") })).status).toBe(409);
  });
});

describe("estorno e cheque devolvido (decisões 6 e 9)", () => {
  it("exige motivo; registra usuário, hora e motivo; nada é apagado", async () => {
    const { admin, financeiro, order, account } = await setup();
    const created = await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "200.00" });
    const id = created.body.payment.id as string;
    expect((await financeiro.post(`/api/payments/${id}/reverse`).send({})).status).toBe(400);
    expect((await financeiro.post(`/api/payments/${id}/reverse`).send({ reason: "  " })).status).toBe(400);

    const reversed = await financeiro.post(`/api/payments/${id}/reverse`).send({ reason: "Lançado no cliente errado" });
    expect(reversed.status).toBe(200);
    expect(reversed.body.payment.status).toBe("REVERSED");
    const last = reversed.body.payment.history.at(-1);
    expect(last).toMatchObject({ fromStatus: "CONFIRMED", toStatus: "REVERSED", changedBy: "Teste caixa1", reason: "Lançado no cliente errado" });
    expect(await prisma.payment.count({ where: { id } })).toBe(1); // continua no banco
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "payment.reverse", entityId: id } });
    expect((audit.after as { reason: string }).reason).toBe("Lançado no cliente errado");
    expect((await getPayments(admin, order.id)).summary).toMatchObject({ received: "0.00", balance: "1000.00", available: "1000.00" });
    // Estornado é definitivo.
    expect((await admin.post(`/api/payments/${id}/reverse`).send({ reason: "de novo" })).status).toBe(409);
    expect(account("BRADESCO")).toBeTruthy();
  });

  it("cheque devolvido: estorna com motivo, saldo e disponibilidade voltam, substituto é um novo pagamento e o histórico do antigo é preservado", async () => {
    const { admin, order, account } = await setup();
    const check = { method: "CHECK", amount: "1000.00", check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" } };
    const first = await admin.post(`/api/orders/${order.id}/payments`).send(check);
    await admin.post(`/api/payments/${first.body.payment.id}/clear`).send({ accountId: account("BRADESCO") });
    expect((await getPayments(admin, order.id)).summary).toMatchObject({ received: "1000.00", balance: "0.00", available: "0.00" });

    await admin.post(`/api/payments/${first.body.payment.id}/reverse`).send({ reason: "Cheque devolvido por falta de fundos" });
    expect((await getPayments(admin, order.id)).summary).toMatchObject({ received: "0.00", balance: "1000.00", available: "1000.00" });

    const replacement = await admin.post(`/api/orders/${order.id}/payments`).send({ ...check, check: { ...check.check, number: "2" } });
    expect(replacement.status).toBe(201);
    expect(replacement.body.payment.id).not.toBe(first.body.payment.id);
    const all = (await getPayments(admin, order.id)).payments as { id: string; status: string; history: unknown[] }[];
    expect(all).toHaveLength(2);
    const old = all.find((p) => p.id === first.body.payment.id)!;
    expect(old.status).toBe("REVERSED");
    expect(old.history).toHaveLength(3); // registro, compensação, estorno
  });

  it("concorrência: dois estornos simultâneos → um vence, o outro recebe 409", async () => {
    const { admin, financeiro, order } = await setup();
    const created = await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "100.00" });
    const id = created.body.payment.id as string;
    const results = await Promise.all([
      admin.post(`/api/payments/${id}/reverse`).send({ reason: "A" + "bc" }),
      financeiro.post(`/api/payments/${id}/reverse`).send({ reason: "Outro motivo" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.paymentStatusHistory.count({ where: { paymentId: id, toStatus: "REVERSED" } })).toBe(1);
  });
});

describe("permissões (decisão 6)", () => {
  it("sem login: 401 em todas as rotas de pagamento", async () => {
    const { order } = await setup();
    const anon = request(app);
    expect((await anon.get(`/api/orders/${order.id}/payments`)).status).toBe(401);
    expect((await anon.post(`/api/orders/${order.id}/payments`).send({})).status).toBe(401);
    expect((await anon.put(`/api/orders/${order.id}/due-dates`).send({})).status).toBe(401);
    expect((await anon.post("/api/payments/x/confirm").send({})).status).toBe(401);
    expect((await anon.post("/api/payments/x/clear").send({})).status).toBe(401);
    expect((await anon.post("/api/payments/x/reverse").send({})).status).toBe(401);
    expect((await anon.get("/api/receiving-accounts")).status).toBe(401);
  });

  it("Financeiro registra, confirma, compensa e estorna", async () => {
    const { financeiro, order, account } = await setup();
    const p = await financeiro.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "100.00"));
    expect(p.status).toBe(201);
    expect((await financeiro.post(`/api/payments/${p.body.payment.id}/confirm`).send({})).status).toBe(200);
    const c = await financeiro.post(`/api/orders/${order.id}/payments`).send({
      method: "CHECK", amount: "100.00", check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" },
    });
    expect((await financeiro.post(`/api/payments/${c.body.payment.id}/clear`).send({ accountId: account("BRADESCO") })).status).toBe(200);
    expect((await financeiro.post(`/api/payments/${c.body.payment.id}/reverse`).send({ reason: "Devolvido" })).status).toBe(200);
  });

  it("não existe rota para apagar pagamento", async () => {
    const { admin, order } = await setup();
    const p = await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "10.00" });
    expect([404, 405]).toContain((await admin.delete(`/api/payments/${p.body.payment.id}`)).status);
    expect(await prisma.payment.count()).toBe(1);
  });

  it("consulta devolve o criador, a data e o histórico de cada pagamento", async () => {
    const { financeiro, order } = await setup();
    await financeiro.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "10.00", receivedAt: "2026-11-20", notes: "Sinal" });
    const { payments } = await getPayments(financeiro, order.id);
    expect(payments[0]).toMatchObject({ createdBy: "Teste caixa1", receivedAt: "2026-11-20", notes: "Sinal", method: "CASH", amount: "10.00" });
    expect(payments[0].history).toHaveLength(1);
  });
});

describe("vencimentos (decisão 11)", () => {
  it("à vista: sem vencimento", async () => {
    const { admin, order } = await setup({ paymentTerm: "IMMEDIATE" });
    expect((await getPayments(admin, order.id)).dueDates).toEqual([]);
  });

  it.each([
    ["TERM_10_DAYS", 10],
    ["TERM_15_DAYS", 15],
    ["TERM_30_DAYS", 30],
  ])("%s: um vencimento criado na confirmação (data de registro + prazo) com o total", async (term, days) => {
    const { admin, order } = await setup({ paymentTerm: term });
    const { dueDates } = await getPayments(admin, order.id);
    expect(dueDates).toHaveLength(1);
    const registered = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const base = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(registered.createdAt);
    const expected = new Date(new Date(`${base}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
    expect(dueDates[0]).toMatchObject({ dueDate: expected, amount: "1000.00", paid: "0.00", open: "1000.00", overdue: false });
  });

  it("saída Pendente (rascunho) ainda não tem vencimento", async () => {
    const { admin, order } = await setup({ paymentTerm: "TERM_15_DAYS", confirm: false });
    expect((await getPayments(admin, order.id)).dueDates).toEqual([]);
  });

  it("vencimento de prazo fixo é editável (um só) e o antigo fica guardado como substituído", async () => {
    const { admin, order } = await setup({ paymentTerm: "TERM_10_DAYS" });
    const response = await admin.put(`/api/orders/${order.id}/due-dates`).send({ dueDates: [{ dueDate: "2027-01-15", amount: "1000.00" }] });
    expect(response.status).toBe(200);
    expect(response.body.dueDates).toHaveLength(1);
    expect(response.body.dueDates[0].dueDate).toBe("2027-01-15");
    expect(await prisma.orderDueDate.count({ where: { orderId: order.id } })).toBe(2);
    expect(await prisma.orderDueDate.count({ where: { orderId: order.id, supersededAt: { not: null } } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "order.due_dates.set", entityId: order.id } })).toBe(1);
    const two = await admin.put(`/api/orders/${order.id}/due-dates`).send({
      dueDates: [{ dueDate: "2027-01-15", amount: "500.00" }, { dueDate: "2027-02-15", amount: "500.00" }],
    });
    expect(two.status).toBe(400); // prazo fixo = um vencimento
  });

  it("negociado: vários vencimentos, soma obrigatoriamente igual ao total", async () => {
    const { admin, order } = await setup({ paymentTerm: "NEGOTIATED" });
    expect((await getPayments(admin, order.id)).dueDates).toEqual([]);
    const wrong = await admin.put(`/api/orders/${order.id}/due-dates`).send({
      dueDates: [{ dueDate: "2027-01-10", amount: "400.00" }, { dueDate: "2027-02-10", amount: "500.00" }],
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toContain("soma dos vencimentos");
    const ok = await admin.put(`/api/orders/${order.id}/due-dates`).send({
      dueDates: [{ dueDate: "2027-02-10", amount: "600.00" }, { dueDate: "2027-01-10", amount: "400.00" }],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.dueDates.map((d: { dueDate: string; sequence: number }) => [d.sequence, d.dueDate])).toEqual([[1, "2027-01-10"], [2, "2027-02-10"]]);
  });

  it("valores decimais dos vencimentos somam sem erro de arredondamento", async () => {
    const { admin, order } = await setup({ paymentTerm: "NEGOTIATED", quantity: 3 }); // total 300.00
    const ok = await admin.put(`/api/orders/${order.id}/due-dates`).send({
      dueDates: [{ dueDate: "2027-01-10", amount: "100.10" }, { dueDate: "2027-02-10", amount: "100.20" }, { dueDate: "2027-03-10", amount: "99.70" }],
    });
    expect(ok.status).toBe(200);
  });

  it("à vista não aceita vencimentos; saída pendente também não", async () => {
    const a = await setup({ paymentTerm: "IMMEDIATE" });
    expect((await a.admin.put(`/api/orders/${a.order.id}/due-dates`).send({ dueDates: [{ dueDate: "2027-01-10", amount: "1000.00" }] })).status).toBe(409);
  });

  it("depois de haver pagamento ativo, os vencimentos ficam travados (renegociação não existe nesta etapa); estornando tudo, destrava", async () => {
    const { admin, order, account } = await setup({ paymentTerm: "TERM_15_DAYS" });
    const p = await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "100.00"));
    const body = { dueDates: [{ dueDate: "2027-03-01", amount: "1000.00" }] };
    expect((await admin.put(`/api/orders/${order.id}/due-dates`).send(body)).status).toBe(409);
    await admin.post(`/api/payments/${p.body.payment.id}/reverse`).send({ reason: "Erro" });
    expect((await admin.put(`/api/orders/${order.id}/due-dates`).send(body)).status).toBe(200);
  });

  it("só pagamentos Confirmados abatem os vencimentos; Pendente e A compensar não", async () => {
    const { admin, order, account } = await setup({ paymentTerm: "NEGOTIATED" });
    await admin.put(`/api/orders/${order.id}/due-dates`).send({
      dueDates: [{ dueDate: "2027-01-10", amount: "400.00" }, { dueDate: "2027-02-10", amount: "600.00" }],
    });
    // O PUT só vale sem pagamentos, então define antes; agora registra:
    await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "400.00")); // Pendente
    await admin.post(`/api/orders/${order.id}/payments`).send({
      method: "CHECK", amount: "100.00", check: { number: "1", bank: "Itaú", expectedClearingDate: "2026-12-10" },
    }); // A compensar
    let { dueDates } = await getPayments(admin, order.id);
    expect(dueDates.map((d: { paid: string }) => d.paid)).toEqual(["0.00", "0.00"]);

    await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "450.00" }); // Confirmado
    ({ dueDates } = await getPayments(admin, order.id));
    expect(dueDates.map((d: { paid: string; open: string }) => [d.paid, d.open])).toEqual([["400.00", "0.00"], ["50.00", "550.00"]]);
  });

  it("em atraso: vencimento passado com valor em aberto aparece em overdue e em overdueAmount", async () => {
    const { admin, order } = await setup({ paymentTerm: "TERM_10_DAYS" });
    await prisma.orderDueDate.updateMany({ where: { orderId: order.id }, data: { dueDate: new Date("2020-01-01T00:00:00Z") } });
    const data = await getPayments(admin, order.id);
    expect(data.dueDates[0].overdue).toBe(true);
    expect(data.overdueAmount).toBe("1000.00");
    await admin.post(`/api/orders/${order.id}/payments`).send({ method: "CASH", amount: "1000.00" });
    const after = await getPayments(admin, order.id);
    expect(after.dueDates[0].overdue).toBe(false);
    expect(after.overdueAmount).toBe("0.00");
  });
});

describe("lista de saídas: filtro por forma de pagamento", () => {
  it("devolve só saídas com pagamento ativo daquele meio (estornado não conta)", async () => {
    const { admin, order, account } = await setup();
    const p = await admin.post(`/api/orders/${order.id}/payments`).send(pix(account("BRADESCO"), "10.00"));
    expect((await admin.get("/api/orders?paymentMethod=PIX")).body.orders).toHaveLength(1);
    expect((await admin.get("/api/orders?paymentMethod=CASH")).body.orders).toHaveLength(0);
    expect((await admin.get("/api/orders")).body.orders).toHaveLength(1);
    await admin.post(`/api/payments/${p.body.payment.id}/reverse`).send({ reason: "Erro" });
    expect((await admin.get("/api/orders?paymentMethod=PIX")).body.orders).toHaveLength(0);
    expect((await admin.get("/api/orders?paymentMethod=XYZ")).status).toBe(400);
  });
});

describe("integridade no banco", () => {
  it("o banco recusa valor zero e dados de cheque inconsistentes, mesmo fora da API", async () => {
    const { order } = await setup();
    const user = await prisma.user.findFirstOrThrow();
    const cash = await prisma.receivingAccount.findUniqueOrThrow({ where: { code: "CASH_BOX" } });
    const base = { orderId: order.id, accountId: cash.id, receivedAt: new Date("2026-11-26T00:00:00Z"), createdById: user.id };
    await expect(prisma.payment.create({ data: { ...base, method: "CASH", amount: "0", status: "CONFIRMED", confirmedAt: new Date() } })).rejects.toThrow();
    await expect(prisma.payment.create({ data: { ...base, method: "CHECK", amount: "10", status: "TO_CLEAR" } })).rejects.toThrow();
    await expect(prisma.payment.create({ data: { ...base, method: "CASH", amount: "10", status: "CONFIRMED" } })).rejects.toThrow(); // Confirmado sem data
  });
});
