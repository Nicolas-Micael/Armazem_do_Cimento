// Espelho, só para a interface, das regras do backend (orders.status.ts).
// O backend é quem decide: aqui servimos apenas para mostrar os botões certos.
import type { OrderStatus } from "../api/orders";

type Advance = "PICKING" | "OUT_FOR_DELIVERY" | "COMPLETED";

/** Próximos passos possíveis a partir do status atual. */
export function nextSteps(status: OrderStatus, deliveryMode: "DELIVERY" | "PICKUP"): Advance[] {
  switch (status) {
    case "CONFIRMED":
      return ["PICKING"];
    case "PICKING":
      return deliveryMode === "PICKUP" ? ["OUT_FOR_DELIVERY", "COMPLETED"] : ["OUT_FOR_DELIVERY"];
    case "OUT_FOR_DELIVERY":
      return ["COMPLETED"];
    default:
      return [];
  }
}

/** Só Em separação e Saiu para entrega podem retornar um passo. */
export function canRevert(status: OrderStatus): boolean {
  return status === "PICKING" || status === "OUT_FOR_DELIVERY";
}

/** Pendente, Confirmado e Em separação podem ser cancelados (pelo ADM). */
export function canCancelStatus(status: OrderStatus): boolean {
  return status === "PENDING" || status === "CONFIRMED" || status === "PICKING";
}

export function advanceLabel(to: Advance, deliveryMode: "DELIVERY" | "PICKUP"): string {
  if (to === "PICKING") return "Iniciar separação";
  if (to === "OUT_FOR_DELIVERY") return deliveryMode === "PICKUP" ? "Liberar para retirada" : "Saiu para entrega";
  return deliveryMode === "PICKUP" ? "Concluir (retirado)" : "Concluir (entregue)";
}
