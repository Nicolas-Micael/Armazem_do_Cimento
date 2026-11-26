// Converte o pedido do banco no formato enviado pela API.
// Dinheiro sai como texto ("38.90") e datas de calendário como "AAAA-MM-DD".
import type { Prisma } from "../../generated/prisma/client.js";
import { Decimal } from "../../lib/money.js";

/** O que buscamos no banco para montar um pedido completo. */
export const orderInclude = {
  items: { orderBy: { position: "asc" } },
  createdBy: { select: { name: true } },
  statusHistory: { orderBy: { changedAt: "asc" }, include: { changedBy: { select: { name: true } } } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** 123 → "PED-000123" (formato provisório, P-PED-1). */
export function formatOrderCode(number: number): string {
  return `PED-${String(number).padStart(6, "0")}`;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function toPublicOrder(order: OrderWithRelations) {
  return {
    id: order.id,
    number: order.number,
    code: formatOrderCode(order.number),
    status: order.status,
    customerId: order.customerId,
    customerName: order.customerNameSnapshot,
    customerDocument: order.customerDocumentSnapshot,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productNameSnapshot,
      unit: item.unit,
      quantity: item.quantity,
      catalogUnitPrice: item.catalogUnitPrice.toFixed(2),
      unitPrice: item.unitPrice.toFixed(2),
      discount: item.discountType ? { type: item.discountType, value: item.discountValue!.toFixed(2) } : null,
      discountAmount: item.discountAmount.toFixed(2),
      // Valor do item antes do desconto do item (quantidade × preço cobrado).
      grossTotal: item.lineTotal.plus(item.discountAmount).toFixed(2),
      lineTotal: item.lineTotal.toFixed(2),
    })),
    subtotal: order.subtotal.toFixed(2),
    freightAmount: order.freightAmount.toFixed(2),
    discount: order.discountType ? { type: order.discountType, value: order.discountValue!.toFixed(2) } : null,
    discountAmount: order.discountAmount.toFixed(2),
    itemDiscountsTotal: order.items.reduce((sum, item) => sum.plus(item.discountAmount), new Decimal(0)).toFixed(2),
    // Produtos antes de qualquer desconto (quantidade × preço de todos os itens).
    grossSubtotal: order.items.reduce((sum, item) => sum.plus(item.lineTotal).plus(item.discountAmount), new Decimal(0)).toFixed(2),
    totalDiscounts: order.items.reduce((sum, item) => sum.plus(item.discountAmount), order.discountAmount).toFixed(2),
    total: order.total.toFixed(2),
    operationType: order.operationType,
    paymentTerm: order.paymentTerm,
    deliveryMode: order.deliveryMode,
    deliveryAddress: order.deliveryAddress,
    deliveryResponsible: order.deliveryResponsible,
    driverName: order.driverName,
    helperName: order.helperName,
    vehicle: order.vehicle,
    licensePlate: order.licensePlate,
    loadedBags: order.loadedBags,
    expectedDeliveryDate: dateOnly(order.expectedDeliveryDate),
    actualDeliveryDate: dateOnly(order.actualDeliveryDate),
    deliveryNotes: order.deliveryNotes,
    notes: order.notes,
    createdBy: order.createdBy.name,
    version: order.version,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    statusHistory: order.statusHistory.map((entry) => ({
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      changedBy: entry.changedBy.name,
      changedAt: entry.changedAt.toISOString(),
      note: entry.note,
    })),
  };
}

export type PublicOrder = ReturnType<typeof toPublicOrder>;

/** Versão para a auditoria (sem o histórico de status, que já tem tabela própria). */
export function orderAuditSnapshot(order: OrderWithRelations) {
  const { statusHistory: _history, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = toPublicOrder(order);
  return rest;
}
