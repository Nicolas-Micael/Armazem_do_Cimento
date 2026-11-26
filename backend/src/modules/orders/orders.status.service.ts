// Mudanças de status operacional da saída: avançar, retornar e cancelar (etapa E1).
// Decisões em docs/decisoes/0009-status-cancelamento.md.
//
// Garantias (todas conferidas aqui, no backend; a tela só mostra os botões):
// - a saída é BLOQUEADA (FOR UPDATE) durante a operação; o mesmo bloqueio é usado ao registrar
//   pagamento, então "cancelar" e "receber" ao mesmo tempo nunca deixam pagamento ativo numa saída cancelada;
// - a `version` enviada precisa ser a atual e o UPDATE só vale se o status continua o mesmo;
// - mudança de status, histórico (`order_status_history`) e auditoria acontecem na mesma transação;
// - nenhum valor da saída é alterado e nada é apagado.
import type { OrderStatus, Prisma } from "../../generated/prisma/client.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { Decimal, moneyToString, sumMoney } from "../../lib/money.js";
import { prisma } from "../../lib/prisma.js";
import { recordAudit } from "../audit/audit.service.js";
import { todayInBusinessZone } from "../dashboard/dashboard.period.js";
import { lockOrder } from "../payments/payments.service.js";
import { orderAuditSnapshot, orderInclude, toPublicOrder } from "./orders.mapper.js";
import type { AdvanceOrderInput, CancelOrderInput, RevertOrderInput } from "./orders.schemas.js";
import { STATUS_LABELS, allowedAdvance, canCancel, previousStatus } from "./orders.status.js";

type Tx = Prisma.TransactionClient;

const STALE_MESSAGE = "Esta saída foi alterada por outra pessoa. Recarregue a página e confira antes de continuar.";
const brl = (value: Decimal) => `R$ ${moneyToString(value).replace(".", ",")}`;

/** Carrega a saída já bloqueada e confere a versão que a pessoa estava vendo. */
async function loadLocked(tx: Tx, id: string, version: number) {
  await lockOrder(tx, id);
  const current = await tx.order.findUnique({ where: { id }, include: orderInclude });
  if (!current) throw new NotFoundError("Saída não encontrada.");
  if (current.version !== version) throw new ConflictError(STALE_MESSAGE);
  return current;
}

/** Troca o status, grava histórico e auditoria. `extra` vai junto no mesmo UPDATE (ex.: data efetiva). */
async function applyStatusChange(
  tx: Tx,
  actorId: string,
  current: NonNullable<Awaited<ReturnType<typeof loadLocked>>>,
  to: OrderStatus,
  options: { action: string; note: string | null; reason?: string; extra?: Prisma.OrderUpdateManyMutationInput; auditExtra?: Record<string, unknown> },
) {
  // "where" com versão E status esperado: só troca se nada mudou desde a leitura.
  const { count } = await tx.order.updateMany({
    where: { id: current.id, version: current.version, status: current.status },
    data: { status: to, version: { increment: 1 }, ...options.extra },
  });
  if (count === 0) throw new ConflictError(STALE_MESSAGE);

  await tx.orderStatusHistory.create({
    data: { orderId: current.id, fromStatus: current.status, toStatus: to, changedById: actorId, note: options.note },
  });
  const updated = await tx.order.findUniqueOrThrow({ where: { id: current.id }, include: orderInclude });
  await recordAudit(tx, {
    userId: actorId,
    action: options.action,
    entityType: "order",
    entityId: current.id,
    before: orderAuditSnapshot(current),
    after: { ...orderAuditSnapshot(updated), ...(options.reason ? { reason: options.reason } : {}), ...options.auditExtra } as Prisma.InputJsonValue,
  });
  return updated;
}

/** Avança o status (ADM ou Financeiro). Concluir registra a data efetiva da entrega/retirada. */
export async function advanceOrder(actorId: string, id: string, input: AdvanceOrderInput) {
  const order = await prisma.$transaction(async (tx) => {
    const current = await loadLocked(tx, id, input.version);
    const allowed = allowedAdvance(current.status, current.deliveryMode);
    if (!allowed.includes(input.to)) {
      const hint =
        current.status === "PENDING"
          ? " Confirme a saída primeiro (só o ADM confirma)."
          : allowed.length > 0
            ? ` A próxima etapa é: ${allowed.map((status) => STATUS_LABELS[status]).join(" ou ")}.`
            : " Este status é definitivo.";
      throw new ConflictError(`Não é possível ir de ${STATUS_LABELS[current.status]} para ${STATUS_LABELS[input.to]}.${hint}`);
    }

    let extra: Prisma.OrderUpdateManyMutationInput | undefined;
    if (input.to === "COMPLETED") {
      // Concluído = entregue/retirado de fato; não exige quitação. Data efetiva: padrão hoje, editável (P-E-2).
      const today = todayInBusinessZone();
      const delivered = input.deliveredAt ?? today;
      const registeredOn = todayInBusinessZone(current.createdAt);
      if (delivered > today) {
        throw new ValidationError("A data efetiva não pode estar no futuro.", [{ field: "deliveredAt", message: "A data efetiva não pode estar no futuro." }]);
      }
      if (delivered < registeredOn) {
        const message = "A data efetiva não pode ser anterior ao dia em que a saída foi registrada.";
        throw new ValidationError(message, [{ field: "deliveredAt", message }]);
      }
      extra = { actualDeliveryDate: new Date(`${delivered}T00:00:00Z`) };
    }

    return applyStatusChange(tx, actorId, current, input.to, { action: "order.advance", note: input.note ?? null, extra });
  });
  return toPublicOrder(order);
}

/** Retorna um passo (só ADM, com motivo). Concluído e Cancelado são definitivos. */
export async function revertOrder(actorId: string, id: string, input: RevertOrderInput) {
  const order = await prisma.$transaction(async (tx) => {
    const current = await loadLocked(tx, id, input.version);
    const previous = previousStatus(current.status);
    if (!previous) {
      const reason =
        current.status === "COMPLETED" || current.status === "CANCELLED"
          ? "Este status é definitivo."
          : current.status === "CONFIRMED"
            ? "Uma saída confirmada não volta a Pendente (os valores continuam travados)."
            : "A saída pendente ainda não avançou.";
      throw new ConflictError(`Não é possível retornar a saída de ${STATUS_LABELS[current.status]}. ${reason}`);
    }
    return applyStatusChange(tx, actorId, current, previous, { action: "order.revert", note: input.reason, reason: input.reason });
  });
  return toPublicOrder(order);
}

/**
 * Cancela a saída (só ADM, com motivo). Regras com pagamentos (decisão 5):
 * - qualquer pagamento CONFIRMADO bloqueia o cancelamento: é preciso devolver o dinheiro ao cliente e o
 *   sistema ainda não registra devolução; estornar o lançamento não comprova a devolução;
 * - pagamentos PENDENTES e A COMPENSAR precisam ser estornados antes.
 */
export async function cancelOrder(actorId: string, id: string, input: CancelOrderInput) {
  const order = await prisma.$transaction(async (tx) => {
    const current = await loadLocked(tx, id, input.version);
    if (!canCancel(current.status)) {
      const why =
        current.status === "CANCELLED"
          ? "Ela já está cancelada."
          : "Só saídas pendentes, confirmadas ou em separação podem ser canceladas.";
      throw new ConflictError(`Não é possível cancelar uma saída ${STATUS_LABELS[current.status].toLowerCase()}. ${why}`);
    }

    const payments = await tx.payment.findMany({ where: { orderId: id }, select: { status: true, amount: true } });
    const total = (status: string) => sumMoney(payments.filter((payment) => payment.status === status).map((payment) => new Decimal(payment.amount.toString())));
    const confirmed = payments.filter((payment) => payment.status === "CONFIRMED");
    if (confirmed.length > 0) {
      throw new ConflictError(
        `Esta saída tem pagamento confirmado (${brl(total("CONFIRMED"))}). Para cancelar é necessário devolver o dinheiro ao cliente de forma efetiva, ` +
          "e o sistema ainda não registra essa devolução (função de uma etapa futura). Estornar o lançamento não comprova a devolução do dinheiro. " +
          "Por isso o cancelamento está bloqueado por enquanto.",
      );
    }
    const open = payments.filter((payment) => payment.status === "PENDING" || payment.status === "TO_CLEAR");
    if (open.length > 0) {
      throw new ConflictError(
        `Há ${open.length} pagamento(s) pendente(s) ou a compensar (${brl(total("PENDING").plus(total("TO_CLEAR")))}). ` +
          "Estorne esses pagamentos, com motivo, antes de cancelar a saída.",
      );
    }

    // Rastreabilidade (P-E-1): quantos pagamentos já estiveram Confirmados e foram estornados antes do cancelamento.
    const everConfirmedThenReversed = await tx.paymentStatusHistory.count({
      where: { payment: { orderId: id }, fromStatus: "CONFIRMED", toStatus: "REVERSED" },
    });
    return applyStatusChange(tx, actorId, current, "CANCELLED", {
      action: "order.cancel",
      note: input.reason,
      reason: input.reason,
      auditExtra: { reversedPaymentsThatWereConfirmed: everConfirmedThenReversed },
    });
  });
  return toPublicOrder(order);
}
