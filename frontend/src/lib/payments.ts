// Regras de apresentação dos pagamentos (puras, testáveis). O backend decide e confere tudo de novo;
// aqui só se escolhe quais botões mostrar e como preencher o formulário.
import type { Payment, PaymentMethod, PaymentStatus } from "../api/payments";

export type PaymentAction = "confirm" | "clear" | "reverse";

/** Ações disponíveis para um pagamento, conforme a situação e o meio. */
export function availableActions(payment: Pick<Payment, "status" | "method">): PaymentAction[] {
  const byStatus: Record<PaymentStatus, PaymentAction[]> = {
    PENDING: ["confirm", "reverse"], // Pix, depósito, transferência: conferir o recebimento
    TO_CLEAR: ["clear", "reverse"], // cheque: compensar (com conta de destino) ou devolver
    CONFIRMED: ["reverse"],
    REVERSED: [], // definitivo
  };
  return byStatus[payment.status];
}

/** Como a conta de destino é escolhida em cada meio. */
export function accountRule(method: PaymentMethod): "cash-box" | "check-wallet" | "bank" {
  if (method === "CASH") return "cash-box"; // Caixa físico, fixo
  if (method === "CHECK") return "check-wallet"; // Carteira de cheques, fixa
  return "bank"; // Bradesco ou Caixa Econômica
}

/** Situação em que o pagamento nasce, só para avisar a pessoa (quem decide é o backend). */
export function initialStatusHint(method: PaymentMethod): PaymentStatus {
  if (method === "CASH" || method === "DEBIT_CARD" || method === "CREDIT_CARD") return "CONFIRMED";
  return method === "CHECK" ? "TO_CLEAR" : "PENDING";
}

/** Vencimentos só são editáveis em saída a prazo, sem pagamento ativo (não estornado). */
export function canEditDueDates(data: { orderStatus: string; paymentTerm: string; payments: readonly Pick<Payment, "status">[] }): boolean {
  const effective = ["CONFIRMED", "PICKING", "OUT_FOR_DELIVERY", "COMPLETED"].includes(data.orderStatus);
  return effective && data.paymentTerm !== "IMMEDIATE" && data.payments.every((payment) => payment.status === "REVERSED");
}
