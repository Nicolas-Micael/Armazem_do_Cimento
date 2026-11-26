// Detalhe de um pedido: dados, itens, valores, entrega e histórico de status.
import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ApiError } from "../../api/client";
import { confirmOrder, getOrder, getOrderHistory, type Order, type OrderHistoryEvent } from "../../api/orders";
import { formatDate, formatDateTime, formatDocument, formatMoney } from "../../lib/format";
import { DELIVERY_MODE_LABELS, OPERATION_TYPE_LABELS, PAYMENT_TERM_LABELS } from "../../lib/labels";
import { FormErrors } from "../../components/FormErrors";
import { formatInteger } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";
import { PaymentsSection } from "../payments/PaymentsSection";
import { StatusBadge } from "./StatusBadge";

export function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<OrderHistoryEvent[] | null>(null);
  // "?revisar=1" (vindo de "Salvar e revisar para confirmar") já abre o painel de revisão.
  const [params] = useSearchParams();
  const [error, setError] = useState<unknown>(null);
  const { user } = useAuth();
  // Só o ADM confirma (o backend também bloqueia os outros perfis).
  const canConfirm = user?.role === "ADMIN";
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmError, setConfirmError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getOrder(id)
      .then(({ order }) => {
        setOrder(order);
        if (params.get("revisar") === "1" && order.status === "PENDING") setConfirming(true);
      })
      .catch(setError);
    getOrderHistory(id)
      .then(({ events }) => setHistory(events))
      .catch(() => setHistory([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleConfirm() {
    if (!order) return;
    setSubmitting(true);
    setConfirmError(null);
    try {
      const { order: confirmed } = await confirmOrder(order.id, { version: order.version, note: note.trim() || undefined });
      setOrder(confirmed);
      getOrderHistory(confirmed.id).then(({ events }) => setHistory(events)).catch(() => undefined);
      setConfirming(false);
      setNote("");
      setNotice(`Saída ${confirmed.code} confirmada. Ela já aparece nos indicadores do painel.`);
    } catch (err) {
      setConfirmError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function reloadOrder() {
    if (!id) return;
    setConfirmError(null);
    try {
      setOrder((await getOrder(id)).order);
      setConfirming(false);
    } catch (err) {
      setError(err);
    }
  }

  if (error) return <FormErrors error={error} />;
  if (!order) return <p className="page-message">Carregando pedido…</p>;

  const discountLabel =
    order.discount?.type === "PERCENTAGE" ? `Desconto geral (${order.discount.value.replace(".", ",")}%)` : "Desconto geral";
  const totalBags = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <>
      <div className="page-title">
        <h1>
          Saída {order.code} <StatusBadge status={order.status} />
        </h1>
        <div className="form-actions">
          {order.status === "PENDING" && canConfirm && !confirming && (
            <button type="button" className="button-primary" onClick={() => setConfirming(true)}>
              Confirmar saída
            </button>
          )}
          {order.status === "PENDING" && (
            <Link to={`/pedidos/${order.id}/editar`} className="button-secondary">
              Editar
            </Link>
          )}
          <Link to="/pedidos" className="button-secondary">
            Voltar
          </Link>
        </div>
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      {order.status === "PENDING" && !canConfirm && (
        <p className="alert alert-notice">Esta saída está pendente e aguarda confirmação do ADM. Enquanto isso, ela pode ser editada e não entra nos indicadores.</p>
      )}

      {confirming && canConfirm && (
        <section className="card confirm-panel" role="alertdialog" aria-labelledby="confirm-title">
          <h2 id="confirm-title">Confirmar a saída {order.code}?</h2>
          <p>Confira os dados abaixo antes de confirmar.</p>
          <dl className="review-list">
            <dt>Cliente</dt>
            <dd>{order.customerName}</dd>
            <dt>Produtos</dt>
            <dd>
              {order.items.map((item) => `${item.productName} (${formatInteger(item.quantity)} × ${formatMoney(item.unitPrice)})`).join("; ")}
            </dd>
            <dt>Sacos</dt>
            <dd>{formatInteger(totalBags)}</dd>
            <dt>Descontos</dt>
            <dd>− {formatMoney(order.totalDiscounts)}</dd>
            <dt>Frete</dt>
            <dd>{formatMoney(order.freightAmount)}</dd>
            <dt>Pagamento</dt>
            <dd>{PAYMENT_TERM_LABELS[order.paymentTerm]}</dd>
            <dt>Entrega</dt>
            <dd>
              {DELIVERY_MODE_LABELS[order.deliveryMode]}
              {order.deliveryAddress ? ` · ${order.deliveryAddress}` : ""}
            </dd>
            <dt>Total</dt>
            <dd>
              <strong>{formatMoney(order.total)}</strong>
            </dd>
          </dl>
          <p className="muted small">
            Depois de confirmada, a saída passa a contar nos indicadores e <strong>não poderá mais ser editada</strong>. A confirmação fica registrada
            com seu nome, a data e a hora.
          </p>
          <FormErrors error={confirmError} />
          <label>
            Observação (opcional)
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </label>
          <div className="form-actions">
            <button type="button" className="button-primary" onClick={() => void handleConfirm()} disabled={submitting}>
              {submitting ? "Confirmando…" : "Sim, confirmar saída"}
            </button>
            <button type="button" className="button-secondary" onClick={() => setConfirming(false)} disabled={submitting}>
              Voltar
            </button>
            {confirmError instanceof ApiError && confirmError.status === 409 && (
              <button type="button" className="button-link" onClick={() => void reloadOrder()}>
                Recarregar pedido
              </button>
            )}
          </div>
        </section>
      )}

      <section className="card info-grid">
        <div>
          <span className="muted small">Cliente</span>
          <p>
            {order.customerName}
            {order.customerDocument && <span className="muted"> · {formatDocument(order.customerDocument)}</span>}
          </p>
        </div>
        <div>
          <span className="muted small">Registrado em</span>
          <p>
            {formatDateTime(order.createdAt)} por {order.createdBy}
          </p>
        </div>
        <div>
          <span className="muted small">Tipo de operação</span>
          <p>{OPERATION_TYPE_LABELS[order.operationType]}</p>
        </div>
        <div>
          <span className="muted small">Condição de pagamento</span>
          <p>{PAYMENT_TERM_LABELS[order.paymentTerm]}</p>
        </div>
        <div>
          <span className="muted small">Entrega</span>
          <p>
            {DELIVERY_MODE_LABELS[order.deliveryMode]}
            {order.expectedDeliveryDate && ` · previsão ${formatDate(order.expectedDeliveryDate)}`}
          </p>
        </div>
        {order.deliveryAddress && (
          <div>
            <span className="muted small">Endereço de entrega</span>
            <p>{order.deliveryAddress}</p>
          </div>
        )}
        {(
          [
            ["Responsável pelo transporte", order.deliveryResponsible],
            ["Motorista", order.driverName],
            ["Ajudante", order.helperName],
            ["Veículo", order.vehicle],
            ["Placa", order.licensePlate],
            ["Sacos carregados", order.loadedBags === null ? null : formatInteger(order.loadedBags)],
          ] as const
        ).map(([label, value]) =>
          value ? (
            <div key={label}>
              <span className="muted small">{label}</span>
              <p>{value}</p>
            </div>
          ) : null,
        )}
        {order.deliveryNotes && (
          <div>
            <span className="muted small">Observações da entrega</span>
            <p>{order.deliveryNotes}</p>
          </div>
        )}
        {order.notes && (
          <div>
            <span className="muted small">Observações</span>
            <p>{order.notes}</p>
          </div>
        )}
      </section>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th className="numeric">Qtd.</th>
              <th className="numeric">Preço unit.</th>
              <th className="numeric">Desconto</th>
              <th className="numeric">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td>{item.productName}</td>
                <td className="numeric">
                  {item.quantity} {item.unit.toLowerCase()}
                  {item.quantity === 1 ? "" : "s"}
                </td>
                <td className="numeric">
                  {formatMoney(item.unitPrice)}
                  {item.unitPrice !== item.catalogUnitPrice && (
                    <div className="muted small">Tabela: {formatMoney(item.catalogUnitPrice)}</div>
                  )}
                </td>
                <td className="numeric">
                  {item.discount ? (
                    <>
                      − {formatMoney(item.discountAmount)}
                      <div className="muted small">
                        {item.discount.type === "PERCENTAGE" ? `${item.discount.value.replace(".", ",")}%` : "valor fixo"}
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="numeric">{formatMoney(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card totals">
        <dl>
          <dt>Produtos (sem descontos)</dt>
          <dd>{formatMoney(order.grossSubtotal)}</dd>
          <dt>Descontos dos itens</dt>
          <dd>− {formatMoney(order.itemDiscountsTotal)}</dd>
          <dt>Frete</dt>
          <dd>{formatMoney(order.freightAmount)}</dd>
          <dt>{discountLabel}</dt>
          <dd>− {formatMoney(order.discountAmount)}</dd>
          <dt className="total">Total da saída</dt>
          <dd className="total">{formatMoney(order.total)}</dd>
        </dl>
      </section>

      {order.status !== "PENDING" && <PaymentsSection key={`${order.status}-${order.version}`} orderId={order.id} orderTotal={order.total} />}

      <section className="card">
        <h2>Histórico de alterações</h2>
        {!history && <p className="muted">Carregando histórico…</p>}
        {history && history.length === 0 && <p className="muted">Nenhum registro.</p>}
        {history && history.length > 0 && (
          <ul className="history-list">
            {history.map((event) => (
              <li key={event.at + event.action + event.title}>
                <strong>{event.title}</strong> · {formatDateTime(event.at)} · {event.userName}
                {event.changes.length > 0 && (
                  <ul>
                    {event.changes.map((change) => (
                      <li key={change.field} className="small">
                        {change.label}: <span className="muted">{change.before ?? "—"}</span> → {change.after ?? "—"}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
