// Detalhe de um pedido: dados, itens, valores, entrega e histórico de status.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { getOrder, type Order } from "../../api/orders";
import { formatDate, formatDateTime, formatDocument, formatMoney } from "../../lib/format";
import { DELIVERY_MODE_LABELS, ORDER_STATUS_LABELS, PAYMENT_TERM_LABELS } from "../../lib/labels";
import { FormErrors } from "../../components/FormErrors";
import { StatusBadge } from "./StatusBadge";

export function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!id) return;
    getOrder(id)
      .then(({ order }) => setOrder(order))
      .catch(setError);
  }, [id]);

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
          {order.status === "PENDING" && (
            <Link to={`/pedidos/${order.id}/editar`} className="button-primary">
              Editar
            </Link>
          )}
          <Link to="/pedidos" className="button-secondary">
            Voltar
          </Link>
        </div>
      </div>

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
