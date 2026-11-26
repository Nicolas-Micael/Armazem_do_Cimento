import { apiRequest } from "./client";
import type { OrderStatus } from "./orders";

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
  pendingOrders: { ordersCount: number; total: string };
}

export function getDashboard(period: Period) {
  return apiRequest<DashboardData>(`/dashboard?from=${period.from}&to=${period.to}`);
}
