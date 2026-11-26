// Converte pagamentos do banco no formato enviado pela API (dinheiro como texto, datas como "AAAA-MM-DD").
import type { Prisma } from "../../generated/prisma/client.js";

export const paymentInclude = {
  account: true,
  createdBy: { select: { name: true } },
  history: { orderBy: { changedAt: "asc" }, include: { changedBy: { select: { name: true } } } },
} satisfies Prisma.PaymentInclude;

export type PaymentWithRelations = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;

const dateOnly = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export function toPublicPayment(payment: PaymentWithRelations, accountNames: Map<string, string>) {
  return {
    id: payment.id,
    orderId: payment.orderId,
    method: payment.method,
    account: { id: payment.account.id, code: payment.account.code, name: payment.account.name, kind: payment.account.kind },
    amount: payment.amount.toFixed(2),
    receivedAt: dateOnly(payment.receivedAt),
    status: payment.status,
    confirmedAt: payment.confirmedAt ? payment.confirmedAt.toISOString() : null,
    notes: payment.notes,
    check:
      payment.method === "CHECK"
        ? {
            number: payment.checkNumber,
            bank: payment.checkBank,
            expectedClearingDate: dateOnly(payment.checkExpectedClearing),
          }
        : null,
    createdBy: payment.createdBy.name,
    createdAt: payment.createdAt.toISOString(),
    history: payment.history.map((entry) => ({
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      fromAccount: entry.fromAccountId ? (accountNames.get(entry.fromAccountId) ?? null) : null,
      toAccount: entry.toAccountId ? (accountNames.get(entry.toAccountId) ?? null) : null,
      changedBy: entry.changedBy.name,
      changedAt: entry.changedAt.toISOString(),
      reason: entry.reason,
    })),
  };
}

/** Dados de um pagamento para a auditoria (antes/depois). */
export function paymentAuditSnapshot(payment: PaymentWithRelations) {
  return {
    orderId: payment.orderId,
    method: payment.method,
    account: payment.account.code,
    amount: payment.amount.toFixed(2),
    status: payment.status,
    confirmedAt: payment.confirmedAt ? payment.confirmedAt.toISOString() : null,
  };
}
