// Textos em português para os códigos que vêm da API.
import type { DeliveryMode, OrderStatus, PaymentTerm } from "../api/orders";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  PICKING: "Em separação",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export const PAYMENT_TERM_LABELS: Record<PaymentTerm, string> = {
  IMMEDIATE: "À vista",
  TERM_10_DAYS: "A prazo — 10 dias",
  TERM_15_DAYS: "A prazo — 15 dias",
  NEGOTIATED: "A prazo — negociado",
};

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  DELIVERY: "Entrega",
  PICKUP: "Retirada pelo cliente",
};
