import { apiRequest } from "./client";
import type { OrderStatus } from "./orders";
import type { PaymentMethod } from "./payments";

export interface Period {
  from: string;
  to: string;
}

export interface Totals {
  ordersCount: number;
  bagsSold: number;
  /** Dinheiro como texto, ex.: "1556.00". */
  revenue: string;
  averageTicket: string;
  customersServed: number;
}

export type Variation = Record<keyof Totals, string | null>;

/** Indicadores financeiros (definições em docs/decisoes/0008-pagamentos.md). */
export interface FinancialIndicators {
  /** Líquido do período = confirmado − estornado (cada um na data do seu evento); pode ser negativo. */
  received: { total: string; confirmed: string; reversed: string; paymentsCount: number };
  receivedByMethod: { method: PaymentMethod; total: string; paymentsCount: number }[];
  receivedByAccount: { accountId: string; accountName: string; total: string; paymentsCount: number }[];
  /** Posição de hoje (não depende do período): saídas efetivadas − Confirmados. */
  receivable: string;
  toClear: { total: string; paymentsCount: number };
  pendingConference: { total: string; paymentsCount: number };
  overdue: { total: string; dueDatesCount: number; ordersCount: number };
}

export interface DashboardData {
  period: Period;
  previousPeriod: Period;
  totals: Totals;
  previousTotals: Totals;
  /** Variação % sobre o período anterior ("12.5"); null = não há base de comparação. */
  variation: Variation;
  salesByDay: { date: string; ordersCount: number; bagsSold: number; revenue: string }[];
  salesByProduct: { productId: string; productName: string; bagsSold: number; itemsValue: string }[];
  topCustomers: { customerId: string; customerName: string; ordersCount: number; bagsSold: number; revenue: string }[];
  recentOrders: { id: string; number: number; createdAt: string; customerName: string; status: OrderStatus; bagsSold: number; total: string }[];
  financial: FinancialIndicators;
  pendingOrders: { ordersCount: number; total: string };
}

export function getDashboard(period: Period) {
  return apiRequest<DashboardData>(`/dashboard?from=${period.from}&to=${period.to}`);
}
