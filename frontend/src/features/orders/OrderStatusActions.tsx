// Ações de situação da saída: avançar (ADM e Financeiro), retornar e cancelar (só ADM).
// Os botões escondidos por perfil são só conveniência; o backend é quem bloqueia.
import { useState } from "react";
import { ApiError } from "../../api/client";
import { advanceOrder, cancelOrder, revertOrder, type Order } from "../../api/orders";
import { FormErrors } from "../../components/FormErrors";
import { advanceLabel, canCancelStatus, canRevert, nextSteps } from "../../lib/orderStatus";

type Panel = null | { kind: "advance"; to: "PICKING" | "OUT_FOR_DELIVERY" | "COMPLETED" } | { kind: "revert" } | { kind: "cancel" };

interface Props {
  order: Order;
  isAdmin: boolean;
  canAdvance: boolean;
  onChanged: (order: Order, message: string) => void;
  onReload: () => void;
}

const todayIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export function OrderStatusActions({ order, isAdmin, canAdvance, onChanged, onReload }: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [deliveredAt, setDeliveredAt] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const steps = canAdvance ? nextSteps(order.status, order.deliveryMode) : [];
  const revert = isAdmin && canRevert(order.status);
  const cancel = isAdmin && canCancelStatus(order.status);
  if (steps.length === 0 && !revert && !cancel) return null;

  function open(next: Panel) {
    setPanel(next);
    setError(null);
    setReason("");
    setNote("");
    setDeliveredAt(todayIso());
  }

  async function submit() {
    if (!panel) return;
    setBusy(true);
    setError(null);
    try {
      let result: { order: Order };
      let message: string;
      if (panel.kind === "advance") {
        result = await advanceOrder(order.id, {
          version: order.version,
          to: panel.to,
          note: note.trim() || undefined,
          deliveredAt: panel.to === "COMPLETED" ? deliveredAt : undefined,
        });
        message = `Saída ${order.code} atualizada.`;
      } else if (panel.kind === "revert") {
        result = await revertOrder(order.id, { version: order.version, reason: reason.trim() });
        message = `Saída ${order.code} retornou um passo.`;
      } else {
        result = await cancelOrder(order.id, { version: order.version, reason: reason.trim() });
        message = `Saída ${order.code} cancelada. O histórico foi preservado.`;
      }
      setPanel(null);
      onChanged(result.order, message);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const needsReason = panel?.kind === "revert" || panel?.kind === "cancel";
  const reasonOk = reason.trim().length >= 3;

  return (
    <section className="card confirm-panel">
      <h2>Situação da saída</h2>
      {!panel && (
        <div className="form-actions">
          {steps.map((to) => (
            <button key={to} type="button" className="button-primary" onClick={() => open({ kind: "advance", to })}>
              {advanceLabel(to, order.deliveryMode)}
            </button>
          ))}
          {revert && (
            <button type="button" className="button-secondary" onClick={() => open({ kind: "revert" })}>
              Retornar um passo
            </button>
          )}
          {cancel && (
            <button type="button" className="button-secondary" onClick={() => open({ kind: "cancel" })}>
              Cancelar saída
            </button>
          )}
        </div>
      )}
      {panel?.kind === "advance" && panel.to === "COMPLETED" && (
        <>
          <p className="muted small">
            Concluir significa que o produto foi {order.deliveryMode === "PICKUP" ? "retirado" : "entregue"}. Não exige pagamento: o saldo a
            receber continua em aberto.
          </p>
          <label>
            Data efetiva
            <input type="date" value={deliveredAt} max={todayIso()} onChange={(e) => setDeliveredAt(e.target.value)} />
          </label>
        </>
      )}
      {panel?.kind === "advance" && (
        <label>
          Observação (opcional)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </label>
      )}
      {needsReason && (
        <>
          <p className="muted small">
            {panel.kind === "cancel"
              ? "O cancelamento não apaga nada: a saída e seus lançamentos continuam no histórico. Não é possível desfazer."
              : "A saída volta uma etapa. O motivo fica registrado no histórico."}
          </p>
          <label>
            Motivo (obrigatório, mínimo 3 caracteres)
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </label>
        </>
      )}
      {panel && (
        <>
          <FormErrors error={error} />
          <div className="form-actions">
            <button
              type="button"
              className="button-primary"
              onClick={() => void submit()}
              disabled={busy || (needsReason && !reasonOk) || (panel.kind === "advance" && panel.to === "COMPLETED" && !deliveredAt)}
            >
              {busy ? "Salvando…" : panel.kind === "cancel" ? "Confirmar cancelamento" : panel.kind === "revert" ? "Confirmar retorno" : "Confirmar"}
            </button>
            <button type="button" className="button-secondary" onClick={() => setPanel(null)} disabled={busy}>
              Voltar
            </button>
            {error instanceof ApiError && error.status === 409 && (
              <button type="button" className="button-link" onClick={onReload}>
                Recarregar saída
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
