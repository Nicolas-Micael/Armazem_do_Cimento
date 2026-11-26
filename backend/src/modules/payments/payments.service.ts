// Regras de negócio dos pagamentos (etapa D1). Decisões em docs/decisoes/0008-pagamentos.md.
//
// Garantias principais:
// - só saída Confirmada (ou posterior, não cancelada) recebe pagamento;
// - Confirmado + Pendente + A compensar nunca passa do total da saída, mesmo com duas
//   pessoas registrando ao mesmo tempo: a saída é BLOQUEADA (FOR UPDATE) durante o registro;
// - a situação inicial é decidida pelo backend conforme o meio, não pelo cliente;
// - cada mudança grava histórico + auditoria na mesma transação; nada é apagado.
import type { PaymentMethod, PaymentStatus, Prisma } from "../../generated/prisma/client.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { Decimal, moneyToString, sumMoney } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit } from "../audit/audit.service.js";
import { todayInBusinessZone } from "../dashboard/dashboard.period.js";
import { EFFECTIVE_STATUSES } from "../dashboard/dashboard.service.js";
import { isFixedTerm } from "./dueDates.service.js";
import { allocateDueDates, summarizePayments, summaryToPublic } from "./payments.calculations.js";
import { paymentAuditSnapshot, paymentInclude, toPublicPayment } from "./payments.mapper.js";
import type { ClearCheckInput, ConfirmPaymentInput, CreatePaymentInput, ReversePaymentInput, SetDueDatesInput } from "./payments.schemas.js";

type Tx = Prisma.TransactionClient;

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

/** Situação inicial por meio (decisão 3). */
export function initialStatus(method: PaymentMethod): PaymentStatus {
  if (method === "CASH" || method === "DEBIT_CARD" || method === "CREDIT_CARD") return "CONFIRMED";
  if (method === "CHECK") return "TO_CLEAR";
  return "PENDING"; // Pix, depósito, transferência: só viram recebidos depois da conferência
}

const brl = (value: Decimal) => `R$ ${moneyToString(value).replace(".", ",")}`;

/** Bloqueia a linha da saída até o fim da transação: serializa quem mexe no mesmo pedido. */
async function lockOrder(tx: Tx, orderId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "orders" WHERE "id" = ${orderId} FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError("Saída não encontrada.");
}

async function accountNames(db: Tx | typeof prisma) {
  const accounts = await db.receivingAccount.findMany();
  return new Map(accounts.map((account) => [account.id, account.name]));
}

/**
 * Descobre a conta de destino do pagamento (decisão 4 e leitura P-D-3).
 * Cheque → Carteira de cheques; dinheiro → Caixa físico; demais → conta bancária escolhida.
 */
async function resolveAccount(tx: Tx, method: PaymentMethod, accountId: string | undefined) {
  const wanted = method === "CHECK" ? "CHECK_WALLET" : method === "CASH" ? "CASH_BOX" : null;
  if (wanted) {
    const account = await tx.receivingAccount.findUniqueOrThrow({ where: { code: wanted } });
    if (accountId && accountId !== account.id) {
      const message = method === "CHECK" ? "Cheque entra sempre na Carteira de cheques." : "Dinheiro entra sempre no Caixa físico.";
      throw new ValidationError(message, [{ field: "accountId", message }]);
    }
    return account;
  }
  if (!accountId) {
    throw new ValidationError("Escolha a conta de destino.", [{ field: "accountId", message: "Escolha a conta de destino." }]);
  }
  const account = await tx.receivingAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.active || account.kind !== "BANK") {
    const message = "Para este meio de pagamento escolha uma conta bancária (Bradesco ou Caixa Econômica).";
    throw new ValidationError(message, [{ field: "accountId", message }]);
  }
  return account;
}

/** Registra um pagamento da saída. */
export async function registerPayment(actorId: string, orderId: string, input: CreatePaymentInput) {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!(EFFECTIVE_STATUSES as readonly string[]).includes(order.status)) {
      throw new ConflictError(
        order.status === "PENDING"
          ? "A saída ainda está pendente. Só saídas confirmadas recebem pagamentos."
          : "Saídas canceladas não recebem pagamentos.",
      );
    }

    const amount = new Decimal(input.amount);
    if (amount.lte(0)) {
      throw new ValidationError("O valor deve ser maior que zero.", [{ field: "amount", message: "O valor deve ser maior que zero." }]);
    }
    const account = await resolveAccount(tx, input.method, input.accountId);

    // Limite (decisão 8): tudo que "compromete" a saída — exceto Estornado — mais o novo valor ≤ total.
    const existing = await tx.payment.findMany({ where: { orderId }, select: { amount: true, status: true } });
    const summary = summarizePayments(
      new Decimal(order.total.toString()),
      existing.map((payment) => ({ amount: new Decimal(payment.amount.toString()), status: payment.status })),
    );
    if (amount.gt(summary.available)) {
      const message = summary.available.lte(0)
        ? "Esta saída não tem valor disponível para novos pagamentos."
        : `O valor passa do disponível para novos registros (${brl(summary.available)}).`;
      throw new ConflictError(message);
    }

    const status = initialStatus(input.method);
    const created = await tx.payment.create({
      data: {
        orderId,
        method: input.method,
        accountId: account.id,
        amount: amount.toFixed(2),
        receivedAt: toDate(input.receivedAt ?? todayInBusinessZone()),
        status,
        confirmedAt: status === "CONFIRMED" ? new Date() : null,
        notes: input.notes ?? null,
        checkNumber: input.check?.number ?? null,
        checkBank: input.check?.bank ?? null,
        checkExpectedClearing: input.check ? toDate(input.check.expectedClearingDate) : null,
        createdById: actorId,
        history: { create: { fromStatus: null, toStatus: status, toAccountId: account.id, changedById: actorId } },
      },
      include: paymentInclude,
    });
    await recordAudit(tx, {
      userId: actorId,
      action: "payment.create",
      entityType: "payment",
      entityId: created.id,
      after: paymentAuditSnapshot(created),
    });
    return toPublicPayment(created, await accountNames(tx));
  });
}

/**
 * Muda a situação de um pagamento de forma segura: o "where" com a situação esperada faz a troca
 * acontecer só se ninguém mexeu antes (duas confirmações/estornos simultâneos: um vence, o outro recebe 409).
 */
async function transition(
  actorId: string,
  paymentId: string,
  rule: { from: PaymentStatus[]; to: PaymentStatus; action: string; wrongStateMessage: string },
  options: { accountId?: string; reason?: string; note?: string | null; allowMethods?: PaymentMethod[]; wrongMethodMessage?: string; requireBank?: boolean },
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
    if (!current) throw new NotFoundError("Pagamento não encontrado.");
    if (options.allowMethods && !options.allowMethods.includes(current.method)) {
      throw new ConflictError(options.wrongMethodMessage ?? "Operação não permitida para este meio de pagamento.");
    }
    if (!rule.from.includes(current.status)) throw new ConflictError(rule.wrongStateMessage);

    let newAccountId: string | undefined;
    if (options.requireBank) {
      const account = options.accountId ? await tx.receivingAccount.findUnique({ where: { id: options.accountId } }) : null;
      if (!account || !account.active || account.kind !== "BANK") {
        const message = "Escolha a conta bancária onde o cheque foi depositado (Bradesco ou Caixa Econômica).";
        throw new ValidationError(message, [{ field: "accountId", message }]);
      }
      newAccountId = account.id;
    }

    const { count } = await tx.payment.updateMany({
      where: { id: paymentId, status: { in: rule.from } },
      data: {
        status: rule.to,
        ...(rule.to === "CONFIRMED" ? { confirmedAt: new Date() } : {}),
        ...(newAccountId ? { accountId: newAccountId } : {}),
      },
    });
    if (count === 0) throw new ConflictError("Este pagamento foi alterado por outra pessoa. Recarregue e confira.");

    await tx.paymentStatusHistory.create({
      data: {
        paymentId,
        fromStatus: current.status,
        toStatus: rule.to,
        fromAccountId: newAccountId && newAccountId !== current.accountId ? current.accountId : null,
        toAccountId: newAccountId && newAccountId !== current.accountId ? newAccountId : null,
        changedById: actorId,
        reason: options.reason ?? options.note ?? null,
      },
    });
    const updated = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude });
    await recordAudit(tx, {
      userId: actorId,
      action: rule.action,
      entityType: "payment",
      entityId: paymentId,
      before: paymentAuditSnapshot(current),
      after: { ...paymentAuditSnapshot(updated), ...(options.reason ? { reason: options.reason } : {}) },
    });
    return toPublicPayment(updated, await accountNames(tx));
  });
}

/** Confirma o recebimento após a conferência (Pix, depósito, transferência: Pendente → Confirmado). */
export function confirmPayment(actorId: string, paymentId: string, input: ConfirmPaymentInput) {
  return transition(
    actorId,
    paymentId,
    { from: ["PENDING"], to: "CONFIRMED", action: "payment.confirm", wrongStateMessage: "Só pagamentos pendentes podem ser confirmados." },
    { note: input.note },
  );
}

/** Compensa um cheque (A compensar → Confirmado) exigindo a conta de destino; a troca de conta vai para o histórico. */
export function clearCheck(actorId: string, paymentId: string, input: ClearCheckInput) {
  return transition(
    actorId,
    paymentId,
    { from: ["TO_CLEAR"], to: "CONFIRMED", action: "payment.clear", wrongStateMessage: "Só cheques a compensar podem ser compensados." },
    { accountId: input.accountId, note: input.note, allowMethods: ["CHECK"], wrongMethodMessage: "Só cheques são compensados.", requireBank: true },
  );
}

/** Estorna um pagamento (qualquer situação ativa), com motivo obrigatório. Estornado é definitivo. */
export function reversePayment(actorId: string, paymentId: string, input: ReversePaymentInput) {
  return transition(
    actorId,
    paymentId,
    {
      from: ["PENDING", "TO_CLEAR", "CONFIRMED"],
      to: "REVERSED",
      action: "payment.reverse",
      wrongStateMessage: "Este pagamento já foi estornado.",
    },
    { reason: input.reason },
  );
}

/** Pagamentos, resumo e vencimentos de uma saída. */
export async function getOrderPayments(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError("Saída não encontrada.");
  const [payments, dueDates, names] = await Promise.all([
    prisma.payment.findMany({ where: { orderId }, include: paymentInclude, orderBy: { createdAt: "desc" } }),
    prisma.orderDueDate.findMany({ where: { orderId, supersededAt: null }, orderBy: [{ dueDate: "asc" }, { sequence: "asc" }] }),
    accountNames(prisma),
  ]);

  const total = new Decimal(order.total.toString());
  const summary = summarizePayments(
    total,
    payments.map((payment) => ({ amount: new Decimal(payment.amount.toString()), status: payment.status })),
  );
  const allocated = allocateDueDates(
    dueDates.map((due) => ({
      id: due.id,
      sequence: due.sequence,
      dueDate: due.dueDate.toISOString().slice(0, 10),
      amount: new Decimal(due.amount.toString()),
    })),
    summary.received,
    todayInBusinessZone(),
  );

  return {
    orderId,
    orderStatus: order.status,
    paymentTerm: order.paymentTerm,
    // Só saída confirmada em diante e com valor disponível aceita novo pagamento.
    canReceive: (EFFECTIVE_STATUSES as readonly string[]).includes(order.status),
    summary: summaryToPublic(summary),
    overdueAmount: moneyToString(sumMoney(allocated.filter((due) => due.overdue).map((due) => due.open))),
    dueDates: allocated.map((due) => ({
      id: due.id,
      sequence: due.sequence,
      dueDate: due.dueDate,
      amount: moneyToString(due.amount),
      paid: moneyToString(due.paid),
      open: moneyToString(due.open),
      overdue: due.overdue,
    })),
    payments: payments.map((payment) => toPublicPayment(payment, names)),
  };
}

/**
 * Define os vencimentos de uma saída a prazo (leitura P-D-1).
 * - 10/15/30 dias: exatamente 1 vencimento (editar a data); Negociado: 1 a 24, soma = total;
 * - só enquanto não há pagamento ativo (depois seria renegociação, fora desta etapa);
 * - os vencimentos anteriores ficam guardados como substituídos, nunca apagados.
 */
export async function setDueDates(actorId: string, orderId: string, input: SetDueDatesInput) {
  await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!(EFFECTIVE_STATUSES as readonly string[]).includes(order.status)) {
      throw new ConflictError("Só saídas confirmadas (e não canceladas) têm vencimentos.");
    }
    if (order.paymentTerm === "IMMEDIATE") throw new ConflictError("Saída à vista não tem vencimentos.");
    if (isFixedTerm(order.paymentTerm) && input.dueDates.length !== 1) {
      throw new ValidationError("Nos prazos de 10, 15 e 30 dias há um único vencimento.", [
        { field: "dueDates", message: "Informe um único vencimento." },
      ]);
    }

    const total = new Decimal(order.total.toString());
    const amounts = input.dueDates.map((due) => new Decimal(due.amount));
    const invalid = amounts.findIndex((value) => value.lte(0));
    if (invalid >= 0) {
      const message = "O valor do vencimento deve ser maior que zero.";
      throw new ValidationError(message, [{ field: `dueDates.${invalid}.amount`, message }]);
    }
    if (!sumMoney(amounts).equals(total)) {
      const message = `A soma dos vencimentos (${brl(sumMoney(amounts))}) deve ser igual ao total da saída (${brl(total)}).`;
      throw new ValidationError(message, [{ field: "dueDates", message }]);
    }

    const active = await tx.payment.count({ where: { orderId, status: { not: "REVERSED" } } });
    if (active > 0) {
      throw new ConflictError("Já existem pagamentos nesta saída. Alterar vencimentos agora seria renegociação, ainda não disponível.");
    }

    const previous = await tx.orderDueDate.findMany({ where: { orderId, supersededAt: null }, orderBy: { sequence: "asc" } });
    await tx.orderDueDate.updateMany({ where: { orderId, supersededAt: null }, data: { supersededAt: new Date() } });
    const sorted = input.dueDates.map((due, index) => ({ ...due, amount: amounts[index]! })).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    await tx.orderDueDate.createMany({
      data: sorted.map((due, index) => ({
        orderId,
        sequence: index + 1,
        dueDate: toDate(due.dueDate),
        amount: due.amount.toFixed(2),
        createdById: actorId,
      })),
    });
    await recordAudit(tx, {
      userId: actorId,
      action: "order.due_dates.set",
      entityType: "order",
      entityId: orderId,
      before: previous.map((due) => ({ dueDate: due.dueDate.toISOString().slice(0, 10), amount: due.amount.toFixed(2) })),
      after: sorted.map((due) => ({ dueDate: due.dueDate, amount: due.amount.toFixed(2) })),
    });
  });
  return getOrderPayments(orderId);
}

export async function listReceivingAccounts() {
  const accounts = await prisma.receivingAccount.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return accounts.map((account) => ({ id: account.id, code: account.code, name: account.name, kind: account.kind }));
}

