import { apiRequest, jsonBody } from "./client";
import type { OrderStatus, PaymentTerm } from "./orders";

export type PaymentMethod = "CASH" | "PIX" | "CHECK" | "DEPOSIT" | "DEBIT_CARD" | "CREDIT_CARD" | "TRANSFER";
export type PaymentStatus = "PENDING" | "TO_CLEAR" | "CONFIRMED" | "REVERSED";
export type AccountKind = "BANK" | "CASH_BOX" | "CHECK_WALLET";

export interface ReceivingAccount {
  id: string;
  code: string;
  name: string;
  kind: AccountKind;
}

export interface PaymentHistoryEntry {
  fromStatus: PaymentStatus | null;
  toStatus: PaymentStatus;
  fromAccount: string | null;
  toAccount: string | null;
  changedBy: string;
  changedAt: string;
  reason: string | null;
}

export interface Payment {
  id: string;
  orderId: string;
  method: PaymentMethod;
  account: ReceivingAccount;
  /** Dinheiro como texto, ex.: "250.50". */
  amount: string;
  receivedAt: string;
  status: PaymentStatus;
  confirmedAt: string | null;
  notes: string | null;
  check: { number: string | null; bank: string | null; expectedClearingDate: string | null } | null;
  createdBy: string;
  createdAt: string;
  history: PaymentHistoryEntry[];
}

export interface PaymentSummary {
  total: string;
  /** Só pagamentos Confirmados. */
  received: string;
  toClear: string;
  pending: string;
  /** Saldo a receber = total − Confirmados. */
  balance: string;
  /** Disponível para novos registros = total − Confirmados − Pendentes − A compensar. */
  available: string;
}

export interface DueDate {
  id: string;
  sequence: number;
  dueDate: string;
  amount: string;
  paid: string;
  open: string;
  overdue: boolean;
}

export interface OrderPayments {
  orderId: string;
  orderStatus: OrderStatus;
  paymentTerm: PaymentTerm;
  canReceive: boolean;
  summary: PaymentSummary;
  overdueAmount: string;
  dueDates: DueDate[];
  payments: Payment[];
}

export interface PaymentInput {
  method: PaymentMethod;
  amount: string;
  accountId?: string;
  receivedAt?: string;
  notes?: string | null;
  check?: { number: string; bank: string; expectedClearingDate: string };
}

export const listReceivingAccounts = () => apiRequest<{ accounts: ReceivingAccount[] }>("/receiving-accounts");
export const getOrderPayments = (orderId: string) => apiRequest<OrderPayments>(`/orders/${orderId}/payments`);
export const registerPayment = (orderId: string, data: PaymentInput) =>
  apiRequest<{ payment: Payment }>(`/orders/${orderId}/payments`, jsonBody("POST", data));
export const confirmPayment = (id: string, data: { note?: string }) =>
  apiRequest<{ payment: Payment }>(`/payments/${id}/confirm`, jsonBody("POST", data));
export const clearCheck = (id: string, data: { accountId: string; note?: string }) =>
  apiRequest<{ payment: Payment }>(`/payments/${id}/clear`, jsonBody("POST", data));
export const reversePayment = (id: string, data: { reason: string }) =>
  apiRequest<{ payment: Payment }>(`/payments/${id}/reverse`, jsonBody("POST", data));
export const setDueDates = (orderId: string, dueDates: { dueDate: string; amount: string }[]) =>
  apiRequest<OrderPayments>(`/orders/${orderId}/due-dates`, jsonBody("PUT", { dueDates }));
