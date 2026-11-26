// Indicadores financeiros do painel (etapa D2), calculados dos pagamentos gravados.
//
// DEFINIÇÕES (leituras provisórias P-DASH-3 e P-DASH-4, ver docs/decisoes/0008-pagamentos.md):
// - Recebido no período = confirmações do período − estornos (de pagamentos que estavam Confirmados)
//   do período, pela data de cada EVENTO no histórico (dia de Brasília), qualquer que seja a data da venda:
//   a confirmação soma na data em que aconteceu e o estorno subtrai na data do estorno. Confirmar e
//   estornar no mesmo período dá efeito líquido zero; estornar num período posterior deixa aquele período
//   negativo e preserva o anterior. Estornar um pagamento que ainda não estava Confirmado não altera o recebido.
//   Cheque conta na data da compensação. Nada é apagado: o cálculo lê o histórico dos pagamentos.
// - A receber: posição de HOJE (não depende do filtro de período) = total das saídas efetivadas
//   − pagamentos Confirmados dessas saídas.
// - Em atraso: vencimentos anteriores a hoje com valor em aberto, já abatidos os Confirmados
//   (os mais antigos primeiro), nas saídas efetivadas.
// - A compensar (cheques) e Pendentes de conferência: valores ainda NÃO recebidos, mostrados à parte.
import { Prisma } from "../../generated/prisma/client.js";
import { Decimal, moneyToString, sumMoney } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import { allocateDueDates } from "../payments/payments.calculations.js";
import { BUSINESS_TIME_ZONE, addDays, todayInBusinessZone, type Period } from "./dashboard.period.js";
import { EFFECTIVE_STATUSES } from "./dashboard.service.js";

const TZ = Prisma.raw(`'${BUSINESS_TIME_ZONE}'`);

export async function getFinancialIndicators(period: Period) {
  const start = period.from;
  const endExclusive = addDays(period.to, 1);
  // Eventos do período: +1 quando o pagamento virou Confirmado, −1 quando um Confirmado foi estornado.
  const ledger = Prisma.sql`(
    SELECT p.id, p.method, p.account_id, p.amount,
           CASE WHEN h.to_status = 'CONFIRMED' THEN 1 ELSE -1 END AS sign
    FROM payment_status_history h JOIN payments p ON p.id = h.payment_id
    WHERE (h.to_status = 'CONFIRMED' OR (h.from_status = 'CONFIRMED' AND h.to_status = 'REVERSED'))
      AND h.changed_at >= (${start}::date)::timestamp AT TIME ZONE ${TZ}
      AND h.changed_at < (${endExclusive}::date)::timestamp AT TIME ZONE ${TZ}
  ) ev`;
  const effective = Prisma.sql`o.status::text IN (${Prisma.join([...EFFECTIVE_STATUSES])})`;

  const [receivedRow, byMethod, byAccount, ordersTotal, confirmedTotal, notReceived, dueRows, confirmedByOrder] = await Promise.all([
    prisma.$queryRaw<{ confirmed: string; reversed: string; count: number }[]>`
      SELECT COALESCE(SUM(ev.amount) FILTER (WHERE ev.sign = 1), 0)::text AS confirmed,
             COALESCE(SUM(ev.amount) FILTER (WHERE ev.sign = -1), 0)::text AS reversed,
             COALESCE(SUM(ev.sign), 0)::int AS count
      FROM ${ledger}`,
    prisma.$queryRaw<{ method: string; total: string; count: number }[]>`
      SELECT ev.method::text AS method, SUM(ev.amount * ev.sign)::text AS total, SUM(ev.sign)::int AS count
      FROM ${ledger} GROUP BY ev.method HAVING SUM(ev.amount * ev.sign) <> 0 ORDER BY SUM(ev.amount * ev.sign) DESC`,
    prisma.$queryRaw<{ account_id: string; name: string; total: string; count: number }[]>`
      SELECT a.id AS account_id, a.name, SUM(ev.amount * ev.sign)::text AS total, SUM(ev.sign)::int AS count
      FROM ${ledger} JOIN receiving_accounts a ON a.id = ev.account_id
      GROUP BY a.id, a.name HAVING SUM(ev.amount * ev.sign) <> 0 ORDER BY SUM(ev.amount * ev.sign) DESC`,
    prisma.$queryRaw<{ total: string }[]>`SELECT COALESCE(SUM(o.total), 0)::text AS total FROM orders o WHERE ${effective}`,
    prisma.$queryRaw<{ total: string }[]>`
      SELECT COALESCE(SUM(p.amount), 0)::text AS total FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE ${effective} AND p.status = 'CONFIRMED'`,
    prisma.$queryRaw<{ status: string; total: string; count: number }[]>`
      SELECT p.status::text AS status, SUM(p.amount)::text AS total, COUNT(*)::int AS count
      FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE ${effective} AND p.status IN ('TO_CLEAR', 'PENDING') GROUP BY p.status`,
    prisma.$queryRaw<{ id: string; order_id: string; sequence: number; due_date: string; amount: string }[]>`
      SELECT d.id, d.order_id, d.sequence, d.due_date::text AS due_date, d.amount::text AS amount
      FROM order_due_dates d JOIN orders o ON o.id = d.order_id
      WHERE d.superseded_at IS NULL AND ${effective}`,
    prisma.$queryRaw<{ order_id: string; total: string }[]>`
      SELECT p.order_id, SUM(p.amount)::text AS total FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE ${effective} AND p.status = 'CONFIRMED' GROUP BY p.order_id`,
  ]);

  // Em atraso: aplica, saída por saída, o recebido Confirmado aos vencimentos mais antigos.
  const today = todayInBusinessZone();
  const confirmedMap = new Map(confirmedByOrder.map((row) => [row.order_id, new Decimal(row.total)]));
  const duesByOrder = new Map<string, typeof dueRows>();
  for (const row of dueRows) duesByOrder.set(row.order_id, [...(duesByOrder.get(row.order_id) ?? []), row]);
  let overdueAmount = new Decimal(0);
  let overdueDueDates = 0;
  const overdueOrders = new Set<string>();
  for (const [orderId, dues] of duesByOrder) {
    const allocated = allocateDueDates(
      dues.map((due) => ({ id: due.id, sequence: due.sequence, dueDate: due.due_date, amount: new Decimal(due.amount) })),
      confirmedMap.get(orderId) ?? new Decimal(0),
      today,
    ).filter((due) => due.overdue);
    if (allocated.length > 0) overdueOrders.add(orderId);
    overdueDueDates += allocated.length;
    overdueAmount = overdueAmount.plus(sumMoney(allocated.map((due) => due.open)));
  }

  const notReceivedBy = (status: string) => notReceived.find((row) => row.status === status);
  return {
    // total = confirmado − estornado no período (pode ser negativo se só houve estornos).
    received: {
      total: moneyToString(new Decimal(receivedRow[0]?.confirmed ?? "0").minus(receivedRow[0]?.reversed ?? "0")),
      confirmed: moneyToString(new Decimal(receivedRow[0]?.confirmed ?? "0")),
      reversed: moneyToString(new Decimal(receivedRow[0]?.reversed ?? "0")),
      paymentsCount: receivedRow[0]?.count ?? 0,
    },
    receivedByMethod: byMethod.map((row) => ({ method: row.method, total: moneyToString(new Decimal(row.total)), paymentsCount: row.count })),
    receivedByAccount: byAccount.map((row) => ({
      accountId: row.account_id,
      accountName: row.name,
      total: moneyToString(new Decimal(row.total)),
      paymentsCount: row.count,
    })),
    // Posição de hoje, independente do período.
    receivable: moneyToString(new Decimal(ordersTotal[0]?.total ?? "0").minus(new Decimal(confirmedTotal[0]?.total ?? "0"))),
    toClear: {
      total: moneyToString(new Decimal(notReceivedBy("TO_CLEAR")?.total ?? "0")),
      paymentsCount: notReceivedBy("TO_CLEAR")?.count ?? 0,
    },
    pendingConference: {
      total: moneyToString(new Decimal(notReceivedBy("PENDING")?.total ?? "0")),
      paymentsCount: notReceivedBy("PENDING")?.count ?? 0,
    },
    overdue: { total: moneyToString(overdueAmount), dueDatesCount: overdueDueDates, ordersCount: overdueOrders.size },
  };
}
