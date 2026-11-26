import { apiRequest, jsonBody } from "./client";
import type { Page } from "./types";

export type OrderStatus = "PENDING" | "CONFIRMED" | "PICKING" | "OUT_FOR_DELIVERY" | "COMPLETED" | "CANCELLED";
export type PaymentTerm = "IMMEDIATE" | "TERM_10_DAYS" | "TERM_15_DAYS" | "NEGOTIATED";
export type DeliveryMode = "DELIVERY" | "PICKUP";
export type DiscountType = "FIXED" | "PERCENTAGE";

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  catalogUnitPrice: string;
  unitPrice: string;
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
  total: string;
  paymentTerm: PaymentTerm;
  deliveryMode: DeliveryMode;
  deliveryAddress: string | null;
  deliveryResponsible: string | null;
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
  items: { productId: string; quantity: number; unitPrice?: string }[];
  freightAmount: string;
  discount: { type: DiscountType; value: string } | null;
  paymentTerm: PaymentTerm;
  deliveryMode: DeliveryMode;
  deliveryAddress: string;
  deliveryResponsible: string;
  expectedDeliveryDate: string | null;
  deliveryNotes: string;
  notes: string;
}

export interface OrderPreview {
  items: { productId: string; catalogUnitPrice: string; unitPrice: string; lineTotal: string }[];
  subtotal: string;
  freightAmount: string;
  discountAmount: string;
  total: string;
}

export function listOrders(params: { search?: string; status?: OrderStatus | "all"; page?: number }) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.page) query.set("page", String(params.page));
  return apiRequest<Page & { orders: Order[] }>(`/orders?${query.toString()}`);
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
