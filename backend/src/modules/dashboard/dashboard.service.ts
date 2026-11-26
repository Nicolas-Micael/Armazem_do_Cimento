// Indicadores do painel, calculados a partir dos pedidos gravados no banco.
//
// REGRAS (decisão do Nicolas, 26/11/2026):
// - Só contam saídas EFETIVADAS: Confirmado, Em separação, Saiu para entrega e Concluído.
// - Pendente (rascunho) e Cancelado ficam de fora de todos os indicadores.
// - Nada é estimado: o painel não mostra "valor recebido" nem "saldo a receber",
//   porque ainda não existem pagamentos registrados (etapa D).
//
// ❓ P-DASH-1: o período usa a data de registro do pedido (created_at). Quando existir
//    uma "data da saída" própria, troque a coluna em um só lugar (DATE_COLUMN).
// ❓ P-DASH-2: "Faturamento" = soma do TOTAL dos pedidos (produtos + frete − desconto).
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { Decimal, moneyToString } from "../../lib/money.js";
import { BUSINESS_TIME_ZONE, addDays, defaultPeriod, listDays, previousPeriod, validatePeriod, type Period } from "./dashboard.period.js";

/** Situações que contam como saída efetivada. */
export const EFFECTIVE_STATUSES = ["CONFIRMED", "PICKING", "OUT_FOR_DELIVERY", "COMPLETED"] as const;

const TZ = Prisma.raw(`'${BUSINESS_TIME_ZONE}'`);
const DATE_COLUMN = Prisma.raw("o.created_at");

/** Condição SQL: saída efetivada dentro do período (dias inteiros, horário de Brasília). */
function effectiveInPeriod(period: Period) {
  const start = period.from;
  const endExclusive = addDays(period.to, 1);
  return Prisma.sql`o.status::text IN (${Prisma.join([...EFFECTIVE_STATUSES])})
    AND ${DATE_COLUMN} >= (${start}::date)::timestamp AT TIME ZONE ${TZ}
    AND ${DATE_COLUMN} < (${endExclusive}::date)::timestamp AT TIME ZONE ${TZ}`;
}

export interface Totals {
  ordersCount: number;
  bagsSold: number;
  revenue: string;
  averageTicket: string;
  customersServed: number;
}

async function totalsFor(period: Period): Promise<Totals> {
  const where = effectiveInPeriod(period);
  const [orders] = await prisma.$queryRaw<{ orders_count: number; revenue: string; customers: number }[]>`
    SELECT COUNT(*)::int AS orders_count,
           COALESCE(SUM(o.total), 0)::text AS revenue,
           COUNT(DISTINCT o.customer_id)::int AS customers
    FROM orders o WHERE ${where}`;
  const [bags] = await prisma.$queryRaw<{ bags: number }[]>`
    SELECT COALESCE(SUM(i.quantity), 0)::int AS bags
    FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${where}`;

  const ordersCount = orders?.orders_count ?? 0;
  const revenue = new Decimal(orders?.revenue ?? "0");
  return {
    ordersCount,
    bagsSold: bags?.bags ?? 0,
    revenue: moneyToString(revenue),
    // Ticket médio = faturamento ÷ quantidade de saídas (0 se não houve saída).
    averageTicket: moneyToString(ordersCount === 0 ? new Decimal(0) : revenue.div(ordersCount)),
    customersServed: orders?.customers ?? 0,
  };
}

/**
 * Variação percentual entre o período atual e o anterior, com 1 casa: "12.5" ou "-3.0".
 * Devolve null quando o período anterior é zero (não existe base de comparação).
 */
export function variationPercent(current: string | number, previous: string | number): string | null {
  const before = new Decimal(previous);
  if (before.isZero()) return null;
  return new Decimal(current).minus(before).div(before).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1);
}

export interface DashboardQuery {
  from?: string;
  to?: string;
}

export async function getDashboard(query: DashboardQuery) {
  const fallback = defaultPeriod();
  const period = validatePeriod({ from: query.from ?? fallback.from, to: query.to ?? fallback.to });
  const previous = previousPeriod(period);
  const where = effectiveInPeriod(period);

  const [totals, previousTotals] = await Promise.all([totalsFor(period), totalsFor(previous)]);

  // "Dia" no horário de Brasília, como texto AAAA-MM-DD.
  const dayExpr = Prisma.sql`(${DATE_COLUMN} AT TIME ZONE ${TZ})::date::text`;

  const [ordersByDay, bagsByDay, byProduct, customerOrders, customerBags, recent, pending] = await Promise.all([
    prisma.$queryRaw<{ day: string; orders_count: number; revenue: string }[]>`
      SELECT ${dayExpr} AS day, COUNT(*)::int AS orders_count, SUM(o.total)::text AS revenue
      FROM orders o WHERE ${where} GROUP BY 1`,
    prisma.$queryRaw<{ day: string; bags: number }[]>`
      SELECT ${dayExpr} AS day, SUM(i.quantity)::int AS bags
      FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${where} GROUP BY 1`,
    // Vendas por produto: soma do valor dos ITENS (antes de frete e desconto geral do pedido).
    prisma.$queryRaw<{ product_id: string; name: string; bags: number; items_value: string }[]>`
      SELECT p.id AS product_id, p.name, SUM(i.quantity)::int AS bags, SUM(i.line_total)::text AS items_value
      FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id
      WHERE ${where} GROUP BY p.id, p.name ORDER BY bags DESC, p.name LIMIT 10`,
    prisma.$queryRaw<{ customer_id: string; name: string; orders_count: number; revenue: string }[]>`
      SELECT c.id AS customer_id, c.name, COUNT(*)::int AS orders_count, SUM(o.total)::text AS revenue
      FROM orders o JOIN customers c ON c.id = o.customer_id WHERE ${where} GROUP BY c.id, c.name`,
    prisma.$queryRaw<{ customer_id: string; bags: number }[]>`
      SELECT o.customer_id, SUM(i.quantity)::int AS bags
      FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${where} GROUP BY o.customer_id`,
    prisma.$queryRaw<{ id: string; number: number; created_at: Date; customer_name: string; status: string; total: string; bags: number }[]>`
      SELECT o.id, o.number, o.created_at, o.customer_name_snapshot AS customer_name, o.status::text AS status,
             o.total::text AS total, (SELECT COALESCE(SUM(i.quantity), 0)::int FROM order_items i WHERE i.order_id = o.id) AS bags
      FROM orders o WHERE ${where} ORDER BY o.created_at DESC, o.number DESC LIMIT 8`,
    // Pendentes não entram nos indicadores; aparecem à parte, só como aviso de trabalho em aberto.
    prisma.order.aggregate({ where: { status: "PENDING" }, _count: true, _sum: { total: true } }),
  ]);

  // Junta pedidos e sacos por dia e preenche os dias sem venda com zero.
  const ordersMap = new Map(ordersByDay.map((row) => [row.day, row]));
  const bagsMap = new Map(bagsByDay.map((row) => [row.day, row.bags]));
  const salesByDay = listDays(period).map((date) => ({
    date,
    ordersCount: ordersMap.get(date)?.orders_count ?? 0,
    bagsSold: bagsMap.get(date) ?? 0,
    revenue: moneyToString(new Decimal(ordersMap.get(date)?.revenue ?? "0")),
  }));

  const bagsByCustomer = new Map(customerBags.map((row) => [row.customer_id, row.bags]));
  const topCustomers = customerOrders
    .map((row) => ({
      customerId: row.customer_id,
      customerName: row.name,
      ordersCount: row.orders_count,
      bagsSold: bagsByCustomer.get(row.customer_id) ?? 0,
      revenue: moneyToString(new Decimal(row.revenue)),
    }))
    .sort((a, b) => b.bagsSold - a.bagsSold || a.customerName.localeCompare(b.customerName, "pt-BR"))
    .slice(0, 10);

  return {
    period,
    previousPeriod: previous,
    totals,
    previousTotals,
    variation: {
      ordersCount: variationPercent(totals.ordersCount, previousTotals.ordersCount),
      bagsSold: variationPercent(totals.bagsSold, previousTotals.bagsSold),
      revenue: variationPercent(totals.revenue, previousTotals.revenue),
      averageTicket: variationPercent(totals.averageTicket, previousTotals.averageTicket),
      customersServed: variationPercent(totals.customersServed, previousTotals.customersServed),
    },
    salesByDay,
    salesByProduct: byProduct.map((row) => ({
      productId: row.product_id,
      productName: row.name,
      bagsSold: row.bags,
      itemsValue: moneyToString(new Decimal(row.items_value)),
    })),
    topCustomers,
    recentOrders: recent.map((row) => ({
      id: row.id,
      number: row.number,
      createdAt: row.created_at.toISOString(),
      customerName: row.customer_name,
      status: row.status,
      bagsSold: row.bags,
      total: moneyToString(new Decimal(row.total)),
    })),
    pendingOrders: {
      ordersCount: pending._count,
      total: moneyToString(new Decimal(pending._sum.total ?? 0)),
    },
  };
}
