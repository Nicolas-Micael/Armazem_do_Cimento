// Detalhe de um pedido: dados, itens, valores, entrega e histórico de status.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError } from "../../api/client";
import { confirmOrder, getOrder, type Order } from "../../api/orders";
import { formatDate, formatDateTime, formatDocument, formatMoney } from "../../lib/format";
import { DELIVERY_MODE_LABELS, ORDER_STATUS_LABELS, PAYMENT_TERM_LABELS } from "../../lib/labels";
import { FormErrors } from "../../components/FormErrors";
import { formatInteger } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";
import { StatusBadge } from "./StatusBadge";

export function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
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
      .then(({ order }) => setOrder(order))
      .catch(setError);
  }, [id]);

  async function handleConfirm() {
    if (!order) return;
    setSubmitting(true);
    setConfirmError(null);
    try {
      const { order: confirmed } = await confirmOrder(order.id, { version: order.version, note: note.trim() || undefined });
      setOrder(confirmed);
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
    order.discount?.type === "PERCENTAGE" ? `Desconto (${order.discount.value.replace(".", ",")}% sobre os produtos)` : "Desconto";

  return (
    <>
      <div className="page-title">
        <h1>
          Pedido {order.code} <StatusBadge status={order.status} />
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
          <p>
            Cliente <strong>{order.customerName}</strong> · {formatInteger(order.items.reduce((sum, item) => sum + item.quantity, 0))} sacos ·
            total <strong>{formatMoney(order.total)}</strong>
          </p>
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
        {order.deliveryResponsible && (
          <div>
            <span className="muted small">Responsável pela entrega</span>
            <p>{order.deliveryResponsible}</p>
          </div>
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
                <td className="numeric">{formatMoney(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card totals">
        <dl>
          <dt>Produtos</dt>
          <dd>{formatMoney(order.subtotal)}</dd>
          <dt>Frete</dt>
          <dd>{formatMoney(order.freightAmount)}</dd>
          <dt>{discountLabel}</dt>
          <dd>− {formatMoney(order.discountAmount)}</dd>
          <dt className="total">Total do pedido</dt>
          <dd className="total">{formatMoney(order.total)}</dd>
        </dl>
      </section>

      <section className="card">
        <h2>Histórico de status</h2>
        <ul>
          {order.statusHistory.map((entry) => (
            <li key={entry.changedAt + entry.toStatus}>
              {formatDateTime(entry.changedAt)} · {entry.fromStatus ? `${ORDER_STATUS_LABELS[entry.fromStatus]} → ` : "Criado como "}
              {ORDER_STATUS_LABELS[entry.toStatus]} · {entry.changedBy}
              {entry.note && <span className="muted"> · {entry.note}</span>}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
