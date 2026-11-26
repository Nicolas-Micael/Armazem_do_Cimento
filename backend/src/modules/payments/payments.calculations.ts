// Contas dos pagamentos (funções puras, sem banco): resumo de valores e vencimentos.
//
// Nada disto é gravado: é sempre recalculado a partir dos pagamentos (decisão 7/11),
// para não existir um "saldo gravado" que possa ficar diferente da realidade.
import type { PaymentStatus } from "../../generated/prisma/client.js";
import { Decimal, moneyToString, sumMoney } from "../../lib/money.js";

export interface AmountAndStatus {
  amount: Decimal;
  status: PaymentStatus;
}

/**
 * Resumo financeiro de uma saída.
 * - received: pagamentos Confirmados (só estes contam como recebido);
 * - toClear: A compensar (cheques); pending: Pendentes (aguardando conferência);
 * - balance (saldo a receber) = total − Confirmados;
 * - committed = Confirmados + Pendentes + A compensar (Estornado não conta);
 * - available (disponível para novos registros) = total − committed.
 */
export function summarizePayments(total: Decimal, payments: AmountAndStatus[]) {
  const by = (status: PaymentStatus) => sumMoney(payments.filter((payment) => payment.status === status).map((payment) => payment.amount));
  const received = by("CONFIRMED");
  const toClear = by("TO_CLEAR");
  const pending = by("PENDING");
  const committed = received.plus(toClear).plus(pending);
  return { total, received, toClear, pending, committed, balance: total.minus(received), available: total.minus(committed) };
}

export function summaryToPublic(summary: ReturnType<typeof summarizePayments>) {
  return {
    total: moneyToString(summary.total),
    received: moneyToString(summary.received),
    toClear: moneyToString(summary.toClear),
    pending: moneyToString(summary.pending),
    balance: moneyToString(summary.balance),
    available: moneyToString(summary.available),
  };
}

export interface DueDateInput {
  id: string;
  sequence: number;
  /** "AAAA-MM-DD" */
  dueDate: string;
  amount: Decimal;
}

/**
 * Distribui o total RECEBIDO (só Confirmados) pelos vencimentos, do mais antigo para o mais novo.
 * "Em atraso" = vencimento anterior a hoje com valor em aberto.
 */
export function allocateDueDates(dueDates: DueDateInput[], received: Decimal, today: string) {
  const sorted = [...dueDates].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.sequence - b.sequence);
  let remaining = received;
  return sorted.map((due) => {
    const paid = Decimal.min(remaining, due.amount);
    remaining = remaining.minus(paid);
    const open = due.amount.minus(paid);
    return {
      id: due.id,
      sequence: due.sequence,
      dueDate: due.dueDate,
      amount: due.amount,
      paid,
      open,
      overdue: open.gt(0) && due.dueDate < today,
    };
  });
}
