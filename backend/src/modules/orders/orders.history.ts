// Histórico de alterações de uma saída, montado a partir da auditoria (audit_logs).
//
// A auditoria guarda o pedido inteiro "antes" e "depois" de cada ação. Aqui comparamos os
// dois e devolvemos só o que mudou, já em texto pt-BR, para a tela mostrar quem mudou o quê e quando.
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../lib/errors.js";

export interface OrderChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface OrderHistoryEvent {
  action: "order.create" | "order.update" | "order.confirm" | string;
  title: string;
  userName: string;
  at: string;
  changes: OrderChange[];
  /** Motivo informado (retorno de status e cancelamento). */
  reason: string | null;
}

type Snapshot = Record<string, unknown>;

const EMPTY = "—";

/** "1234.5" → "R$ 1.234,50" (mexe só no texto, sem number). */
function money(value: unknown): string {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value ?? ""));
  if (!match) return EMPTY;
  const [, sign = "", integer = "0", decimals = ""] = match;
  return `${sign}R$ ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decimals.padEnd(2, "0")}`;
}

function text(value: unknown): string {
  return value === null || value === undefined || value === "" ? EMPTY : String(value);
}

function date(value: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : EMPTY;
}

function labelOf(map: Record<string, string>) {
  return (value: unknown) => (typeof value === "string" ? (map[value] ?? value) : EMPTY);
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente", CONFIRMED: "Confirmado", PICKING: "Em separação",
  OUT_FOR_DELIVERY: "Saiu para entrega", COMPLETED: "Concluído", CANCELLED: "Cancelado",
};
const TERM_LABELS: Record<string, string> = {
  IMMEDIATE: "À vista", TERM_10_DAYS: "10 dias", TERM_15_DAYS: "15 dias", TERM_30_DAYS: "30 dias", NEGOTIATED: "Prazo negociado",
};

function discountText(value: unknown): string {
  const discount = value as { type?: string; value?: string } | null | undefined;
  if (!discount?.type) return EMPTY;
  return discount.type === "PERCENTAGE" ? `${String(discount.value).replace(".", ",")}%` : money(discount.value);
}

function itemsText(value: unknown): string {
  const items = Array.isArray(value) ? (value as Snapshot[]) : [];
  if (items.length === 0) return EMPTY;
  return items
    .map((item) => {
      const discount = item.discount ? ` (desconto ${discountText(item.discount)})` : "";
      return `${item.productName} — ${item.quantity} × ${money(item.unitPrice)}${discount}`;
    })
    .join("; ");
}

/** Campos comparados, na ordem em que aparecem, com o nome na tela e como virar texto. */
const FIELDS: { field: string; label: string; format: (value: unknown) => string }[] = [
  { field: "status", label: "Situação", format: labelOf(STATUS_LABELS) },
  { field: "customerName", label: "Cliente", format: text },
  { field: "operationType", label: "Tipo de operação", format: labelOf({ SALE: "Venda" }) },
  { field: "items", label: "Itens", format: itemsText },
  { field: "freightAmount", label: "Frete", format: money },
  { field: "discount", label: "Desconto geral", format: discountText },
  { field: "subtotal", label: "Produtos", format: money },
  { field: "total", label: "Total", format: money },
  { field: "paymentTerm", label: "Condição de pagamento", format: labelOf(TERM_LABELS) },
  { field: "deliveryMode", label: "Modalidade", format: labelOf({ DELIVERY: "Entrega", PICKUP: "Retirada" }) },
  { field: "deliveryAddress", label: "Endereço de entrega", format: text },
  { field: "deliveryResponsible", label: "Responsável pelo transporte", format: text },
  { field: "driverName", label: "Motorista", format: text },
  { field: "helperName", label: "Ajudante", format: text },
  { field: "vehicle", label: "Veículo", format: text },
  { field: "licensePlate", label: "Placa", format: text },
  { field: "loadedBags", label: "Sacos carregados", format: text },
  { field: "expectedDeliveryDate", label: "Data prevista", format: date },
  { field: "actualDeliveryDate", label: "Data efetiva da entrega/retirada", format: date },
  { field: "deliveryNotes", label: "Observações da entrega", format: text },
  { field: "notes", label: "Observações", format: text },
];

/** Compara dois retratos do pedido e devolve só o que mudou. (Função pura: não usa o banco.) */
export function diffOrderSnapshots(before: Snapshot | null, after: Snapshot | null): OrderChange[] {
  if (!before || !after) return [];
  const changes: OrderChange[] = [];
  for (const { field, label, format } of FIELDS) {
    const previous = format(before[field]);
    const next = format(after[field]);
    if (previous !== next) changes.push({ field, label, before: previous, after: next });
  }
  return changes;
}

const TITLES: Record<string, string> = {
  "order.create": "Saída registrada",
  "order.update": "Saída editada",
  "order.confirm": "Saída confirmada",
  "order.advance": "Situação avançada",
  "order.revert": "Situação retornada",
  "order.cancel": "Saída cancelada",
};

export async function getOrderHistory(orderId: string): Promise<{ events: OrderHistoryEvent[] }> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!order) throw new NotFoundError("Pedido não encontrado.");

  const logs = await prisma.auditLog.findMany({
    where: { entityType: "order", entityId: orderId },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });

  return {
    events: logs.map((log) => ({
      action: log.action,
      title: TITLES[log.action] ?? log.action,
      userName: log.user.name,
      at: log.createdAt.toISOString(),
      changes: diffOrderSnapshots(log.before as Snapshot | null, log.after as Snapshot | null),
      reason: typeof (log.after as Snapshot | null)?.reason === "string" ? ((log.after as Snapshot).reason as string) : null,
    })),
  };
}
