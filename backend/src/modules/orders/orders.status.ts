// Máquina de estados do status operacional da saída (funções puras, sem banco).
//
// Fluxo (decisões de 26/11/2026, docs/decisoes/0009-status-cancelamento.md):
//   Pendente → Confirmado (só ADM, rota própria) → Em separação → Saiu para entrega → Concluído
// - Retirada: Em separação → Concluído direto também é permitido. Entrega não pula etapa.
// - Retornar: só um passo (Em separação → Confirmado; Saiu para entrega → Em separação).
//   Confirmado não volta a Pendente (reabriria a edição de valores) e Concluído/Cancelado são definitivos.
// - Cancelar: só Pendente, Confirmado e Em separação.
import type { DeliveryMode, OrderStatus } from "../../generated/prisma/client.js";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  PICKING: "Em separação",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

/** Status para os quais a saída pode AVANÇAR a partir do atual. */
export function allowedAdvance(status: OrderStatus, deliveryMode: DeliveryMode): OrderStatus[] {
  switch (status) {
    case "CONFIRMED":
      return ["PICKING"];
    case "PICKING":
      return deliveryMode === "PICKUP" ? ["OUT_FOR_DELIVERY", "COMPLETED"] : ["OUT_FOR_DELIVERY"];
    case "OUT_FOR_DELIVERY":
      return ["COMPLETED"];
    default:
      return []; // Pendente confirma por outra rota; Concluído e Cancelado são definitivos
  }
}

/** Para qual status a saída pode RETORNAR (um passo), ou null se não pode. */
export function previousStatus(status: OrderStatus): OrderStatus | null {
  if (status === "PICKING") return "CONFIRMED";
  if (status === "OUT_FOR_DELIVERY") return "PICKING";
  return null;
}

export const CANCELLABLE_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "PICKING"];

export function canCancel(status: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}
