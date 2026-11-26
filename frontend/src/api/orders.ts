import { apiRequest, jsonBody } from "./client";
import type { PaymentMethod } from "./payments";
import type { Page } from "./types";

export type OrderStatus = "PENDING" | "CONFIRMED" | "PICKING" | "OUT_FOR_DELIVERY" | "COMPLETED" | "CANCELLED";
export type PaymentTerm = "IMMEDIATE" | "TERM_10_DAYS" | "TERM_15_DAYS" | "TERM_30_DAYS" | "NEGOTIATED";
export type DeliveryMode = "DELIVERY" | "PICKUP";
export type DiscountType = "FIXED" | "PERCENTAGE";
export type OperationType = "SALE";
export type Discount = { type: DiscountType; value: string };

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  catalogUnitPrice: string;
  unitPrice: string;
  /** Desconto só deste item (R$ ou %), ou null. */
  discount: Discount | null;
  discountAmount: string;
  /** Quantidade × preço, antes do desconto do item. */
  grossTotal: string;
  lineTotal: string;
}

export interface Order {
  id: string;
  number: number;
  code: string;
  status: OrderStatus;
  customerId: string;
  customerName: string;
  customerDocument: string | null;
  items: OrderItem[];
  subtotal: string;
  freightAmount: string;
  discount: { type: DiscountType; value: string } | null;
  discountAmount: string;
  /** Produtos antes de qualquer desconto. */
  grossSubtotal: string;
  itemDiscountsTotal: string;
  totalDiscounts: string;
  total: string;
  operationType: OperationType;
  paymentTerm: PaymentTerm;
  deliveryMode: DeliveryMode;
  deliveryAddress: string | null;
  deliveryResponsible: string | null;
  driverName: string | null;
  helperName: string | null;
  vehicle: string | null;
  licensePlate: string | null;
  loadedBags: number | null;
  expectedDeliveryDate: string | null;
  actualDeliveryDate: string | null;
  deliveryNotes: string | null;
  notes: string | null;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  statusHistory: { fromStatus: OrderStatus | null; toStatus: OrderStatus; changedBy: string; changedAt: string; note: string | null }[];
}

/** O que o formulário envia. Dinheiro sempre como texto no formato da API ("38.90"). */
export interface OrderData {
  customerId: string;
  items: { productId: string; quantity: number; unitPrice?: string; discount: Discount | null }[];
  freightAmount: string;
  discount: Discount | null;
  operationType: OperationType;
  paymentTerm: PaymentTerm;
  deliveryMode: DeliveryMode;
  deliveryAddress: string;
  deliveryResponsible: string;
  driverName: string;
  helperName: string;
  vehicle: string;
  licensePlate: string;
  loadedBags: number | null;
  expectedDeliveryDate: string | null;
  deliveryNotes: string;
  notes: string;
}

export interface OrderPreview {
  items: {
    productId: string;
    catalogUnitPrice: string;
    unitPrice: string;
    grossTotal: string;
    discountAmount: string;
    lineTotal: string;
  }[];
  grossSubtotal: string;
  itemDiscountsTotal: string;
  subtotal: string;
  freightAmount: string;
  discountAmount: string;
  totalDiscounts: string;
  total: string;
}

export type OrderSortField = "number" | "createdAt" | "customer" | "total" | "status";

/** Item da lista: a saída + recebido e saldo (balance é null em Pendente e Cancelada). */
export type OrderListItem = Order & { received: string; balance: string | null };

export interface OrderListParams {
  search?: string;
  paymentMethod?: PaymentMethod | "all";
  status?: OrderStatus | "all";
  from?: string;
  to?: string;
  customerId?: string;
  productId?: string;
  paymentTerm?: PaymentTerm | "all";
  sortBy?: OrderSortField;
  sortDir?: "asc" | "desc";
  page?: number;
}

export interface OrderTotalsGroup {
  ordersCount: number;
  bagsSold: number;
  total: string;
}

/** Totais sobre TODO o filtro (não só a página): efetivas (confirmadas em diante) e pendentes separadas. */
export interface OrderListTotals {
  effective: OrderTotalsGroup;
  pending: OrderTotalsGroup;
}

export interface OrderHistoryEvent {
  action: string;
  title: string;
  userName: string;
  at: string;
  reason: string | null;
  changes: { field: string; label: string; before: string | null; after: string | null }[];
}

export function listOrders(params: OrderListParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== "all") query.set(key, String(value));
  }
  return apiRequest<Page & { orders: OrderListItem[]; totals: OrderListTotals }>(`/orders?${query.toString()}`);
}

export function getOrderHistory(id: string) {
  return apiRequest<{ events: OrderHistoryEvent[] }>(`/orders/${id}/history`);
}

export function getOrder(id: string) {
  return apiRequest<{ order: Order }>(`/orders/${id}`);
}

/** Pede ao backend o cálculo dos valores, sem salvar. */
export function previewOrder(data: Pick<OrderData, "items" | "freightAmount" | "discount">) {
  return apiRequest<{ preview: OrderPreview }>("/orders/preview", jsonBody("POST", data));
}

export function createOrder(data: OrderData) {
  return apiRequest<{ order: Order }>("/orders", jsonBody("POST", data));
}

export function updateOrder(id: string, data: OrderData & { version: number }) {
  return apiRequest<{ order: Order }>(`/orders/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

/** Confirma a saída (só ADM). Envia a versão que a pessoa estava vendo. */
export function confirmOrder(id: string, data: { version: number; note?: string }) {
  return apiRequest<{ order: Order }>(`/orders/${id}/confirm`, jsonBody("POST", data));
}

/** Avança a situação (ADM e Financeiro). `deliveredAt` só vale ao concluir. */
export function advanceOrder(
  id: string,
  data: { version: number; to: "PICKING" | "OUT_FOR_DELIVERY" | "COMPLETED"; deliveredAt?: string; note?: string },
) {
  return apiRequest<{ order: Order }>(`/orders/${id}/advance`, jsonBody("POST", data));
}

/** Retorna um passo (só ADM), com motivo. */
export function revertOrder(id: string, data: { version: number; reason: string }) {
  return apiRequest<{ order: Order }>(`/orders/${id}/revert`, jsonBody("POST", data));
}

/** Cancela a saída (só ADM), com motivo. */
export function cancelOrder(id: string, data: { version: number; reason: string }) {
  return apiRequest<{ order: Order }>(`/orders/${id}/cancel`, jsonBody("POST", data));
}
