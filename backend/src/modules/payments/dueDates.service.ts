// Vencimentos das saídas a prazo (decisão 11 e leitura P-D-1 de docs/decisoes/0008-pagamentos.md).
import type { Prisma } from "../../generated/prisma/client.js";
import { Decimal } from "../../lib/money.js";
import { addDays, todayInBusinessZone } from "../dashboard/dashboard.period.js";

type Tx = Prisma.TransactionClient;

/** Prazo fixo em dias de cada condição (À vista e Negociado não têm prazo fixo). */
const FIXED_TERM_DAYS = { TERM_10_DAYS: 10, TERM_15_DAYS: 15, TERM_30_DAYS: 30 } as const;

export function isFixedTerm(term: string): term is keyof typeof FIXED_TERM_DAYS {
  return term in FIXED_TERM_DAYS;
}

/**
 * Chamada na confirmação da saída: nos prazos de 10/15/30 dias cria o vencimento único
 * (dia do registro em Brasília + prazo) com o total da saída. Nos outros casos não faz nada.
 */
export async function createFixedTermDueDate(
  tx: Tx,
  order: { id: string; paymentTerm: string; total: Decimal | { toString(): string }; createdAt: Date },
  actorId: string,
) {
  if (!isFixedTerm(order.paymentTerm)) return;
  const dueDate = addDays(todayInBusinessZone(order.createdAt), FIXED_TERM_DAYS[order.paymentTerm]);
  await tx.orderDueDate.create({
    data: {
      orderId: order.id,
      sequence: 1,
      dueDate: new Date(`${dueDate}T00:00:00Z`),
      amount: order.total.toString(),
      createdById: actorId,
    },
  });
}
